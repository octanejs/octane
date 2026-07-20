// Boot both flavors' PRODUCTION servers on OS-assigned loopback ports and
// hand their addresses to the caller. Shared by compare.mjs, the Playwright
// config, and run.mjs so every consumer runs the exact same server contract.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
	return {
		name,
		child,
		port,
		baseURL: `http://127.0.0.1:${port}`,
		logs: () => output,
	};
}

/** Start octane + react production servers. Returns { octane, react, stop }. */
export async function serveBoth(extraEnv = {}) {
	const [octanePort, reactPort] = await Promise.all([getFreePort(), getFreePort()]);
	const octane = spawnFlavor(
		'octane',
		'node',
		['.output/server/index.mjs'],
		path.join(__dirname, 'octane'),
		octanePort,
		extraEnv,
	);
	const react = spawnFlavor(
		'react',
		'node',
		['serve.mjs'],
		path.join(__dirname, 'react'),
		reactPort,
		extraEnv,
	);
	const stop = () => {
		for (const flavor of [octane, react]) {
			try {
				if (process.platform !== 'win32' && flavor.child.pid) {
					process.kill(-flavor.child.pid, 'SIGTERM');
				} else {
					flavor.child.kill('SIGTERM');
				}
			} catch {
				// Already gone.
			}
		}
	};
	try {
		await Promise.all([
			waitForServer(octane.baseURL + '/', octane.child),
			waitForServer(react.baseURL + '/', react.child),
		]);
	} catch (error) {
		stop();
		console.error('octane logs:\n' + octane.logs());
		console.error('react logs:\n' + react.logs());
		throw error;
	}
	return { octane, react, stop };
}
