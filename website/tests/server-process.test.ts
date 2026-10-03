// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
	reserveFreePort,
	startServerOnFreePort,
	stopServer,
	waitForChildExit,
	waitForServer,
} from './support/server-process.ts';

function spawnFixture(source: string): ChildProcess {
	return spawn(process.execPath, ['--input-type=module', '--eval', source], {
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
	});
}

// The error code a fresh listener on host:port fails with, or undefined once it
// listened (it is closed again before this resolves).
function listenError(port: number, host: string): Promise<string | undefined> {
	return new Promise((resolve) => {
		const server = createNetServer();
		server.once('error', (error: NodeJS.ErrnoException) => resolve(error.code));
		server.listen(port, host, () => server.close(() => resolve(undefined)));
	});
}

// What Vite prints when `--strictPort` finds its port taken, then exits 1.
const lostPortFixture = (port: number) =>
	`process.stderr.write('Error: Port ${port} is already in use\\n'); process.exit(1);`;

const listeningFixture = (port: number) =>
	`import { createServer } from 'node:http';
	createServer((_request, response) => response.writeHead(204).end()).listen(${port}, '127.0.0.1');`;

describe('website integration process lifecycle', () => {
	it('reports the build output when a finite child fails', async () => {
		const child = spawnFixture(`process.stderr.write('build sentinel\\n'); process.exit(7);`);

		await expect(waitForChildExit(child, 'fixture build', 1_000)).rejects.toThrow(
			/fixture build exited with code 7[\s\S]*build sentinel/,
		);
	});

	it('terminates a finite child that exceeds its shared build budget', async () => {
		const child = spawnFixture(
			`process.stderr.write('still building\\n'); setInterval(() => {}, 1_000);`,
		);

		await expect(waitForChildExit(child, 'fixture build', 100)).rejects.toThrow(
			/fixture build did not finish within 100ms[\s\S]*still building/,
		);
		expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
	});

	it('reports server output when a child exits before listening', async () => {
		const child = spawnFixture(`process.stderr.write('startup sentinel\\n'); process.exit(9);`);

		await expect(waitForServer(child, 'http://127.0.0.1:1/', 1_000)).rejects.toThrow(
			/server for http:\/\/127\.0\.0\.1:1\/ exited with code 9[\s\S]*startup sentinel/,
		);
	});

	it('reports server output when a live child never begins listening', async () => {
		const child = spawnFixture(
			`process.stderr.write('startup stalled\\n'); setInterval(() => {}, 1_000);`,
		);

		try {
			await expect(waitForServer(child, 'http://127.0.0.1:1/', 1_000)).rejects.toThrow(
				/server at http:\/\/127\.0\.0\.1:1\/ never came up[\s\S]*startup stalled/,
			);
		} finally {
			await stopServer(child);
		}
	});

	it('retries when an individual readiness request stalls', async () => {
		const child = spawnFixture(`setInterval(() => {}, 1_000);`);
		let requests = 0;
		const server = createHttpServer((_request, response) => {
			requests += 1;
			if (requests === 1) return;
			response.writeHead(204).end();
		});
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		const address = server.address();
		if (address === null || typeof address === 'string') throw new Error('missing fixture port');

		try {
			await waitForServer(child, `http://127.0.0.1:${address.port}/`, 2_000);
			expect(requests).toBeGreaterThanOrEqual(2);
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await stopServer(child);
		}
	});

	it('holds a reserved port on 127.0.0.1 until it is released', async () => {
		const { port, release } = await reserveFreePort();
		try {
			expect(await listenError(port, '127.0.0.1')).toBe('EADDRINUSE');
		} finally {
			await release();
		}
		expect(await listenError(port, '127.0.0.1')).toBeUndefined();
	});

	// `localhost` can resolve to ::1, so a hold on 127.0.0.1 alone would let
	// another listener take the very address the server binds.
	it('holds a reserved port on ::1 until it is released', async ({ skip }) => {
		skip((await listenError(0, '::1')) !== undefined, 'this host has no IPv6 loopback');
		const { port, release } = await reserveFreePort();
		try {
			expect(await listenError(port, '::1')).toBe('EADDRINUSE');
		} finally {
			await release();
		}
		expect(await listenError(port, '::1')).toBeUndefined();
	});

	it('starts a server again on a new port when it lost its first one', async () => {
		const ports: number[] = [];
		let child: ChildProcess | undefined;
		try {
			const port = await startServerOnFreePort(
				(port) => {
					ports.push(port);
					child = spawnFixture(ports.length === 1 ? lostPortFixture(port) : listeningFixture(port));
					return child;
				},
				(port) => `http://127.0.0.1:${port}/`,
				10_000,
			);

			expect(ports).toHaveLength(2);
			expect(port).toBe(ports[1]);
			expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(204);
		} finally {
			await stopServer(child);
		}
	});

	it('gives up on a server that keeps losing its port', async () => {
		let spawns = 0;
		await expect(
			startServerOnFreePort(
				(port) => {
					spawns += 1;
					return spawnFixture(lostPortFixture(port));
				},
				(port) => `http://127.0.0.1:${port}/`,
				5_000,
			),
		).rejects.toThrow(/exited with code 1 before listening[\s\S]*Port \d+ is already in use/);
		expect(spawns).toBeGreaterThan(1);
	});

	it('reports any other startup failure without starting the server again', async () => {
		let spawns = 0;
		await expect(
			startServerOnFreePort(
				() => {
					spawns += 1;
					return spawnFixture(`process.stderr.write('startup sentinel\\n'); process.exit(9);`);
				},
				(port) => `http://127.0.0.1:${port}/`,
				5_000,
			),
		).rejects.toThrow(/exited with code 9 before listening[\s\S]*startup sentinel/);
		expect(spawns).toBe(1);
	});
});
