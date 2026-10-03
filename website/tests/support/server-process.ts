// Process plumbing shared by the website's server-backed integration specs: the
// production build/preview pair the project's globalSetup owns, and the Vite dev
// server the hydration e2e still boots for itself. Both need the same three
// guarantees — an ephemeral port, a killable process tree, and a probe that can
// tell "our server answered" from "something answered" — and both used to carry
// their own copy.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { readFile, rename, writeFile } from 'node:fs/promises';

const PROCESS_OUTPUT_LIMIT = 64 * 1024;

function appendProcessOutput(current: string, chunk: unknown): string {
	const next = current + String(chunk);
	return next.length > PROCESS_OUTPUT_LIMIT ? next.slice(-PROCESS_OUTPUT_LIMIT) : next;
}

function processDiagnostic(output: string): string {
	return output.length === 0
		? '\n(no process output was captured)'
		: `\nLast process output:\n${output}`;
}

// Builds are finite processes, unlike the servers below. A child that neither
// exits nor reports an error must still produce one terminal result for every
// consumer of the shared ready-state file. Capturing a bounded output tail also
// keeps the original build failure visible in CI instead of degrading it into
// an unrelated readiness timeout.
export function waitForChildExit(
	child: ChildProcess,
	description: string,
	timeoutMs: number,
): Promise<void> {
	let output = '';
	child.stdout?.on('data', (chunk) => (output = appendProcessOutput(output, chunk)));
	child.stderr?.on('data', (chunk) => (output = appendProcessOutput(output, chunk)));

	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			child.off('error', onError);
			child.off('close', onClose);
			error ? reject(error) : resolve();
		};
		const onError = (error: Error) =>
			finish(
				new Error(`${description} failed to start: ${error.message}${processDiagnostic(output)}`),
			);
		const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
			if (code === 0) finish();
			else {
				const result = signal ? `signal ${signal}` : `code ${code}`;
				finish(new Error(`${description} exited with ${result}${processDiagnostic(output)}`));
			}
		};
		const timeout = setTimeout(async () => {
			if (settled) return;
			settled = true;
			child.off('error', onError);
			child.off('close', onClose);
			await stopServer(child).catch(() => {});
			reject(
				new Error(
					`${description} did not finish within ${timeoutMs}ms${processDiagnostic(output)}`,
				),
			);
		}, timeoutMs);

		child.once('error', onError);
		child.once('close', onClose);
	});
}

function listenOn(port: number, host: string): Promise<Server> {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.once('error', reject);
		srv.listen(port, host, () => {
			srv.off('error', reject);
			resolve(srv);
		});
	});
}

function closeListener(srv: Server): Promise<void> {
	// An already-closed listener reports ERR_SERVER_NOT_RUNNING here; releasing
	// twice (production setup's catch path) is not an error.
	return new Promise((resolve) => srv.close(() => resolve()));
}

const RESERVE_ATTEMPTS = 20;

// A fresh ephemeral port per run — NEVER a fixed one. With a fixed port, a
// leftover server from an earlier run (or another checkout) already listening
// there makes the spawned `--strictPort` server die instantly while the probe
// happily connects to the imposter — and the suite silently asserts against
// foreign code. That exact failure mode shipped a red main.
//
// The port is also HELD until the caller is ready to bind it for real. A probe
// that closes its socket before returning leaves the number free for any other
// process (a parallel vitest project, another checkout) to take while the
// caller is still building the site or clearing a cache, and `--strictPort`
// then kills the server on startup. Keeping the socket listening reserves the
// number up to release(), which belongs immediately before the spawn. See
// startServerOnFreePort for the window that remains after it.
//
// It is held on BOTH loopback addresses. The servers listen on `localhost`,
// which Node resolves to ONE address, `::1` or 127.0.0.1 depending on the
// host's resolver. A port picked and held on 127.0.0.1 alone proves nothing
// about [::1]:port: a listener may already own it, and the kernel can still
// hand it to a new `::1` listener while only the IPv4 side is held. On a host
// without IPv6 loopback nothing can listen on `::1`, so the IPv4 hold alone is
// complete there.
export async function reserveFreePort(): Promise<{ port: number; release: () => Promise<void> }> {
	for (let attempt = 0; attempt < RESERVE_ATTEMPTS; attempt++) {
		const v4 = await listenOn(0, '127.0.0.1');
		const { port } = v4.address() as AddressInfo;
		let v6: Server | undefined;
		try {
			v6 = await listenOn(port, '::1');
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== 'EADDRNOTAVAIL' && code !== 'EAFNOSUPPORT') {
				await closeListener(v4);
				// Taken on the IPv6 side only: pick another number.
				if (code === 'EADDRINUSE') continue;
				throw error;
			}
		}
		return {
			port,
			release: async () => {
				await Promise.all([closeListener(v4), v6 && closeListener(v6)]);
			},
		};
	}
	throw new Error(`no port was free on both loopback addresses in ${RESERVE_ATTEMPTS} attempts`);
}

// Vite under `--strictPort` turns EADDRINUSE into "Port N is already in use"
// and exits before listening. Matching the port just released keeps a plugin's
// own failure on some other port from passing for a lost race.
function lostItsPort(error: unknown, port: number): boolean {
	return (
		error instanceof Error &&
		error.message.includes('before listening') &&
		error.message.includes(`Port ${port} is already in use`)
	);
}

const START_ATTEMPTS = 3;

// Start a server on a freshly reserved port that nothing else knows yet.
//
// release() has to come before the child binds, and a `pnpm exec vite` child
// then spends its whole startup (the pnpm wrapper, the config loader, every
// plugin's setup) before it calls listen(). That is far longer than the gap
// between release() and the spawn, and no reservation can cover it. A port
// taken inside that window kills the child before it listens: waitForServer
// reports that the child exited, and its output names the lost port. That
// outcome alone is a harness race, not a server failure, so it is retried on a
// new reservation. Every other startup failure is rethrown unchanged.
//
// `spawnAt` must keep the child it returns where the caller's stop hook can
// reach it, because a hook timeout can abandon this wait while the child lives.
// The production preview server cannot use this helper: its origin is handed
// to the specs before it is spawned, so its port cannot change.
export async function startServerOnFreePort(
	spawnAt: (port: number) => ChildProcess,
	url: (port: number) => string,
	timeoutMs: number,
): Promise<number> {
	for (let attempt = 1; ; attempt++) {
		const { port, release } = await reserveFreePort();
		await release();
		const child = spawnAt(port);
		try {
			await waitForServer(child, url(port), timeoutMs);
			return port;
		} catch (error) {
			if (attempt >= START_ATTEMPTS || !lostItsPort(error, port)) throw error;
		}
	}
}

// Cross-process readiness handshake for a server built in the BACKGROUND.
//
// globalSetup runs in the Vitest main process and the specs run in workers, so a
// promise cannot be shared between them — a file can. The producer writes the
// terminal state exactly once (see writeReadyState) and the consumer polls for
// it. Without this, a spec would only ever learn "the origin never answered",
// turning a real build failure into an opaque timeout.
export async function writeReadyState(
	readyFile: string,
	state: { ok: true } | { ok: false; error: string },
): Promise<void> {
	// Write-then-rename: a spec polling mid-write must never parse a partial
	// file. rename(2) is atomic within a filesystem.
	const pending = `${readyFile}.pending`;
	await writeFile(pending, JSON.stringify(state), 'utf8');
	await rename(pending, readyFile);
}

export async function waitForReadyState(readyFile: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		let raw: string | undefined;
		try {
			raw = await readFile(readyFile, 'utf8');
		} catch {
			// Not written yet.
		}
		if (raw !== undefined) {
			const state = JSON.parse(raw) as { ok: boolean; error?: string };
			if (state.ok) return;
			throw new Error(`website production build failed:\n${state.error ?? 'unknown error'}`);
		}
		if (Date.now() > deadline) {
			throw new Error(`website production server was not ready within ${timeoutMs}ms`);
		}
		await new Promise((r) => setTimeout(r, 250));
	}
}

// Spawn a server in its OWN process group so stopServer() can kill the whole
// tree. `pnpm exec …` is a wrapper: signalling just the wrapper can orphan the
// real node server underneath, which then squats the port for every later run.
export function spawnServer(
	cwd: string,
	args: string[],
	env: NodeJS.ProcessEnv = {},
): ChildProcess {
	return spawn('pnpm', args, {
		cwd,
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
		env: { ...process.env, ...env },
	});
}

// Wait until the SPAWNED server answers. Rejects the moment the child exits —
// without that, a startup death (port conflict, build error) is invisible and
// the probe loop can end up talking to some other process entirely.
export function waitForServer(child: ChildProcess, url: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let output = '';
	child.stdout?.on('data', (chunk) => (output = appendProcessOutput(output, chunk)));
	child.stderr?.on('data', (chunk) => (output = appendProcessOutput(output, chunk)));

	return new Promise((resolve, reject) => {
		let settled = false;
		const onExit = (code: number | null) => {
			if (settled) return;
			settled = true;
			child.off('error', onError);
			reject(
				new Error(
					`server for ${url} exited with code ${code} before listening${processDiagnostic(output)}`,
				),
			);
		};
		const onError = (error: Error) => {
			if (settled) return;
			settled = true;
			child.off('exit', onExit);
			reject(
				new Error(
					`server for ${url} failed to start: ${error.message}${processDiagnostic(output)}`,
				),
			);
		};
		child.once('exit', onExit);
		child.once('error', onError);
		const probe = async () => {
			if (settled) return;
			const remaining = deadline - Date.now();
			if (remaining <= 0) {
				settled = true;
				child.off('exit', onExit);
				child.off('error', onError);
				return reject(new Error(`server at ${url} never came up${processDiagnostic(output)}`));
			}
			try {
				// A cold Vite/Nitro request can wait on dependency optimization or an
				// in-flight transform without producing a response. Bound each request
				// so one stalled probe cannot consume the whole readiness budget and
				// prevent the retry that observes the initialized environment.
				const res = await fetch(url, {
					signal: AbortSignal.timeout(Math.min(5_000, Math.max(250, Math.floor(remaining / 4)))),
				});
				if (res.status < 500) {
					// An HTTP answer proves something listens on the port — not that
					// it's OUR child: it may have died mid-fetch with its 'exit'
					// dispatch still queued while a foreign process answers. Give the
					// exit event a beat to land, then require the child to be alive.
					await new Promise((r) => setTimeout(r, 50));
					if (settled) return; // onExit rejected meanwhile
					if (child.exitCode !== null || child.signalCode !== null) {
						settled = true;
						child.off('exit', onExit);
						child.off('error', onError);
						return reject(
							new Error(
								`server at ${url} answered but the spawned process is dead${processDiagnostic(output)}`,
							),
						);
					}
					settled = true;
					child.off('exit', onExit);
					child.off('error', onError);
					return resolve();
				}
			} catch {
				// not up yet
			}
			if (Date.now() > deadline) {
				settled = true;
				child.off('exit', onExit);
				child.off('error', onError);
				return reject(new Error(`server at ${url} never came up${processDiagnostic(output)}`));
			}
			setTimeout(probe, 250);
		};
		probe();
	});
}

// Kill the child's whole process group (see spawnServer), SIGKILL fallback.
export async function stopServer(child: ChildProcess | undefined): Promise<void> {
	if (!child || child.pid === undefined || child.exitCode !== null) return;
	const signalGroup = (sig: NodeJS.Signals) => {
		try {
			process.kill(-child.pid!, sig);
		} catch {
			child.kill(sig); // group already gone — signal the child directly
		}
	};
	signalGroup('SIGTERM');
	await new Promise<void>((resolve) => {
		const timeout = setTimeout(resolve, 3000);
		child.once('exit', () => {
			clearTimeout(timeout);
			resolve();
		});
	});
	if (child.exitCode === null) signalGroup('SIGKILL');
}
