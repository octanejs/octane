// Boot the flavors' PRODUCTION servers on OS-assigned loopback ports and
// hand their addresses to the caller. Shared by compare.mjs, the Playwright
// config, and run.mjs so every consumer runs the exact same server contract.
//
// Three flavors:
//   octane-nitro   — the nitro deployment output (node .output/server/index.mjs)
//   octane-minimal — the non-nitro build behind octane/serve.mjs, a
//                    line-for-line mirror of react/serve.mjs
//   react          — @tanstack/react-start's srvx output behind react/serve.mjs
//
// octane-minimal vs react isolates the Octane Start/renderer stack from the
// host; octane-nitro vs octane-minimal isolates the nitro host overhead.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const FLAVORS = {
	'octane-nitro': { command: 'node', args: ['.output/server/index.mjs'], dir: 'octane' },
	'octane-minimal': { command: 'node', args: ['serve.mjs'], dir: 'octane' },
	react: { command: 'node', args: ['serve.mjs'], dir: 'react' },
};

export function getFreePort() {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address();
			probe.close((error) => (error ? reject(error) : resolve(port)));
		});
	});
}

async function waitForServer(url, child, timeoutMs = 30_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (child.exitCode !== null) {
			throw new Error(`server exited with ${child.exitCode} before becoming ready`);
		}
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
			if (response.status < 600) return;
		} catch {
			if (Date.now() > deadline) throw new Error(`server at ${url} never became ready`);
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	}
}

function spawnFlavor(name, command, args, cwd, port, extraEnv) {
	const child = spawn(command, args, {
		cwd,
		env: { ...process.env, PORT: String(port), NODE_ENV: 'production', ...extraEnv },
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: process.platform !== 'win32',
	});
	let output = '';
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	const stop = () => {
		try {
			if (process.platform !== 'win32' && child.pid) {
				process.kill(-child.pid, 'SIGTERM');
			} else {
				child.kill('SIGTERM');
			}
		} catch {
			// Already gone.
		}
	};
	return {
		name,
		child,
		port,
		baseURL: `http://127.0.0.1:${port}`,
		logs: () => output,
		stop,
	};
}

/** Start one flavor by name and wait until it serves. Caller owns .stop(). */
export async function startFlavor(name, extraEnv = {}) {
	const spec = FLAVORS[name];
	if (!spec) throw new Error(`unknown flavor "${name}" (have: ${Object.keys(FLAVORS).join(', ')})`);
	const port = await getFreePort();
	const flavor = spawnFlavor(
		name,
		spec.command,
		spec.args,
		path.join(__dirname, spec.dir),
		port,
		extraEnv,
	);
	try {
		await waitForServer(flavor.baseURL + '/', flavor.child);
	} catch (error) {
		flavor.stop();
		console.error(`${name} logs:\n` + flavor.logs());
		throw error;
	}
	return flavor;
}

/** Start octane(-nitro) + react production servers. Returns { octane, react, stop }. */
export async function serveBoth(extraEnv = {}) {
	const settled = await Promise.allSettled([
		startFlavor('octane-nitro', extraEnv),
		startFlavor('react', extraEnv),
	]);
	const started = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
	const failed = settled.find((s) => s.status === 'rejected');
	if (failed) {
		// One flavor failed to boot; make sure the other doesn't linger.
		for (const flavor of started) flavor.stop();
		throw failed.reason;
	}
	const [octane, react] = started;
	const stop = () => {
		octane.stop();
		react.stop();
	};
	return { octane, react, stop };
}
