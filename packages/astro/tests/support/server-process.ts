import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

// A fresh ephemeral port per run — NEVER a fixed one. With a fixed port, a
// leftover server from an earlier run (or another checkout) already listening
// there makes the spawned `--strictPort` server die instantly while the probe
// happily connects to the imposter — and the suite silently asserts against
// foreign code.
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

// Same ephemeral port, but HELD until the caller is ready to bind it for real.
// Building Astro can take long enough that an unheld port is stolen before
// `astro preview --strictPort` starts.
export async function reserveFreePort(): Promise<{ port: number; release: () => Promise<void> }> {
	const srv = createServer();
	const port = await new Promise<number>((resolve, reject) => {
		srv.once('error', reject);
		srv.listen(0, '127.0.0.1', () => {
			resolve((srv.address() as import('node:net').AddressInfo).port);
		});
	});
	return {
		port,
		release: () => new Promise<void>((resolve) => srv.close(() => resolve())),
	};
}

// Spawn a server in its OWN process group so stopServer() can kill the whole
// tree. `pnpm exec …` is a wrapper: signalling just the wrapper can orphan the
// real node server underneath.
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

// Wait until the SPAWNED server answers. Rejects the moment the child exits.
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
					await new Promise((r) => setTimeout(r, 50));
					if (settled) return;
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
			child.kill(sig);
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
