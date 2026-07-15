import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { spawnServerProcess, stopServer } from './server.ts';

function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
}

async function readChildPid(file: string): Promise<number> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		try {
			const pid = Number(await readFile(file, 'utf8'));
			if (Number.isInteger(pid) && pid > 0) return pid;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
		await delay(20);
	}
	throw new Error('wrapper did not publish its descendant pid');
}

test('stopServer stops the managed process and POSIX process-group descendants', async () => {
	if (process.platform === 'win32') {
		const server = spawnServerProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], {
			cwd: process.cwd(),
			stdio: 'ignore',
		});
		const pid = server.process.pid;
		assert.equal(server.detached, false);
		assert.equal(pid !== undefined && processExists(pid), true);
		await stopServer(server, 100);
		assert.equal(pid !== undefined && processExists(pid), false);
		return;
	}

	const directory = await mkdtemp(path.join(tmpdir(), 'octane-example-server-'));
	const pidFile = path.join(directory, 'descendant.pid');
	let descendantPid: number | undefined;
	const wrapperSource = String.raw`
		const { spawn } = require('node:child_process');
		const { writeFileSync } = require('node:fs');
		const child = spawn(process.execPath, [
			'-e',
			'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);',
		], { stdio: 'ignore' });
		writeFileSync(process.argv[1], String(child.pid));
		setInterval(() => {}, 1000);
	`;
	const server = spawnServerProcess(process.execPath, ['-e', wrapperSource, pidFile], {
		cwd: directory,
		stdio: 'ignore',
	});
	let stopped = false;

	try {
		descendantPid = await readChildPid(pidFile);
		assert.equal(processExists(descendantPid), true);

		await stopServer(server, 100);
		stopped = true;

		assert.equal(processExists(descendantPid), false);
	} finally {
		if (!stopped) {
			await stopServer(server, 100).catch(() => {});
		}
		if (descendantPid !== undefined && processExists(descendantPid)) {
			try {
				process.kill(descendantPid, 'SIGKILL');
			} catch {
				// The descendant may exit between the liveness check and cleanup.
			}
		}
		await rm(directory, { recursive: true, force: true });
	}
});
