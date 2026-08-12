// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { stopServer, waitForChildExit, waitForServer } from './support/server-process.ts';

function spawnFixture(source: string): ChildProcess {
	return spawn(process.execPath, ['--input-type=module', '--eval', source], {
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
	});
}

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
});
