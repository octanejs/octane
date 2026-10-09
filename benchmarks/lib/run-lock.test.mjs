import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { acquireBenchmarkLock } from './run-lock.mjs';

function temporaryLock(t) {
	const directory = mkdtempSync(join(tmpdir(), 'octane-benchmark-lock-test-'));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	return join(directory, 'run.lock');
}

function acquireInChild(lockPath, cwd) {
	return spawnSync(
		process.execPath,
		[
			'--input-type=module',
			'-e',
			`import { acquireBenchmarkLock } from ${JSON.stringify(new URL('./run-lock.mjs', import.meta.url).href)};
const release = acquireBenchmarkLock(process.argv[1]);
console.log('acquired');
release();`,
			lockPath,
		],
		{ cwd, encoding: 'utf8', timeout: 10_000 },
	);
}

test('a competing process in another directory is blocked until the owner releases the lock', (t) => {
	const lockPath = temporaryLock(t);
	const release = acquireBenchmarkLock(lockPath);
	t.after(release);
	const owner = readFileSync(lockPath, 'utf8');
	const competing = acquireInChild(lockPath, tmpdir());
	assert.equal(competing.error, undefined);
	assert.notEqual(competing.status, 0);
	assert.ok(competing.stderr.includes(`PID ${process.pid}`));
	assert.ok(competing.stderr.includes(process.cwd()));
	assert.ok(competing.stderr.includes(lockPath));
	assert.equal(readFileSync(lockPath, 'utf8'), owner);
	release();
	release();
	const next = acquireInChild(lockPath, tmpdir());
	assert.equal(next.error, undefined);
	assert.equal(next.status, 0, next.stderr);
	assert.equal(next.stdout.trim(), 'acquired');
});

for (const contents of [
	'unknown owner',
	JSON.stringify({ pid: 2_147_483_647, cwd: '/stale-run' }),
]) {
	test(`an existing lock is preserved even if its owner cannot be trusted: ${contents}`, (t) => {
		const lockPath = temporaryLock(t);
		writeFileSync(lockPath, contents);
		assert.throws(
			() => acquireBenchmarkLock(lockPath),
			/verify that no benchmark is running before removing this lock/,
		);
		assert.equal(readFileSync(lockPath, 'utf8'), contents);
	});
}

test('releasing an acquired lock preserves a replacement created by another run', (t) => {
	const lockPath = temporaryLock(t);
	const release = acquireBenchmarkLock(lockPath);
	t.after(release);
	unlinkSync(lockPath);
	writeFileSync(lockPath, 'replacement owner');
	release();
	assert.equal(readFileSync(lockPath, 'utf8'), 'replacement owner');
});
