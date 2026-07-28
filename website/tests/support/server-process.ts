// Process plumbing shared by the website's server-backed integration specs: the
// production build/preview pair the project's globalSetup owns, and the Vite dev
// server the hydration e2e still boots for itself. Both need the same three
// guarantees — an ephemeral port, a killable process tree, and a probe that can
// tell "our server answered" from "something answered" — and both used to carry
// their own copy.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

// A fresh ephemeral port per run — NEVER a fixed one. With a fixed port, a
// leftover server from an earlier run (or another checkout) already listening
// there makes the spawned `--strictPort` server die instantly while the probe
// happily connects to the imposter — and the suite silently asserts against
// foreign code. That exact failure mode shipped a red main.
export function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.once('error', reject);
		srv.listen(0, '127.0.0.1', () => {
			const { port } = srv.address() as import('node:net').AddressInfo;
			srv.close(() => resolve(port));
		});
	});
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
		stdio: 'ignore',
		detached: true,
		env: { ...process.env, ...env },
	});
}

// Wait until the SPAWNED server answers. Rejects the moment the child exits —
// without that, a startup death (port conflict, build error) is invisible and
// the probe loop can end up talking to some other process entirely.
export function waitForServer(child: ChildProcess, url: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	return new Promise((resolve, reject) => {
		let settled = false;
		const onExit = (code: number | null) => {
			settled = true;
			reject(new Error(`server for ${url} exited with code ${code} before listening`));
		};
		child.once('exit', onExit);
		const probe = async () => {
			if (settled) return;
			try {
				const res = await fetch(url);
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
						return reject(new Error(`server at ${url} answered but the spawned process is dead`));
					}
					settled = true;
					child.off('exit', onExit);
					return resolve();
				}
			} catch {
				// not up yet
			}
			if (Date.now() > deadline) {
				settled = true;
				child.off('exit', onExit);
				return reject(new Error(`server at ${url} never came up`));
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
	await new Promise((r) => {
		child.once('exit', r);
		setTimeout(r, 3000);
	});
	if (child.exitCode === null) signalGroup('SIGKILL');
}
