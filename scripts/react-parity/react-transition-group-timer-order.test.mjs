import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
	drainZeroDelayTimers,
} = require('../../packages/transition-group/tests/upstream-timer-order.cjs');

test('drains a transition zero-delay completion before an earlier guard timer', () => {
	const events = [];
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;
	const guard = setTimeout(() => events.push('guard'), 0);

	drainZeroDelayTimers(
		() => {
			setTimeout(() => events.push('completion'), 0);
		},
		(callback) => callback(),
	);

	clearTimeout(guard);
	assert.deepEqual(events, ['completion']);
	assert.equal(globalThis.setTimeout, originalSetTimeout);
	assert.equal(globalThis.clearTimeout, originalClearTimeout);
});

test(
	'pristine appear timing survives a stalled event loop but rejects a wrong timeout',
	{ timeout: 90_000 },
	(t) => {
		const repo = resolve(import.meta.dirname, '../..');
		const requireFromPackage = createRequire(join(repo, 'packages/transition-group/package.json'));
		const config = requireFromPackage(
			join(repo, 'packages/transition-group/tests/upstream-jest.config.cjs'),
		);
		const helper = join(repo, 'packages/transition-group/tests/upstream-timer-order.cjs');
		const directory = mkdtempSync(join(tmpdir(), 'transition-timer-controls-'));
		t.after(() => rmSync(directory, { recursive: true, force: true }));
		for (const [name, disableFlush, wrongDelay, expectedCode] of [
			['stalled-correct-delay', false, false, 0],
			['unflushed-renderer-control', true, false, 1],
			['wrong-delay-control', false, true, 1],
		]) {
			const setup = join(directory, `${name}.cjs`);
			writeFileSync(
				setup,
				`
if (${disableFlush}) {
  jest.mock(${JSON.stringify(helper)}, () => ({
    ...jest.requireActual(${JSON.stringify(helper)}),
    flushTimerUpdates: (run) => run(),
  }));
}
let original;
beforeEach(() => {
  original = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => original(function (...received) {
    if (delay === 5) { const until = Date.now() + 40; while (Date.now() < until) {} }
    return callback.apply(this, received);
  }, ${wrongDelay} && delay === 5 ? 100 : delay, ...args);
});
afterEach(() => { globalThis.setTimeout = original; });
`,
			);
			const report = join(directory, `${name}.json`);
			const result = spawnSync(
				process.execPath,
				[
					requireFromPackage.resolve('jest/bin/jest'),
					'--config',
					JSON.stringify({
						...config,
						rootDir: join(repo, 'packages/transition-group/upstream'),
						setupFilesAfterEnv: [setup, ...config.setupFilesAfterEnv],
					}),
					'--runInBand',
					'--no-watchman',
					'--runTestsByPath',
					join(repo, 'packages/transition-group/upstream/test/Transition-test.js'),
					'--testNamePattern',
					'^Transition appearing timeout should use appear timeout if appear is set$',
					'--json',
					`--outputFile=${report}`,
				],
				{ cwd: repo, encoding: 'utf8', timeout: 25_000 },
			);
			const output = `${name}: ${result.stdout}\n${result.stderr}`;
			assert.equal(result.status, expectedCode, output);
			assert.ok(existsSync(report), output);
			const data = JSON.parse(readFileSync(report, 'utf8'));
			assert.equal(data.numFailedTests, expectedCode, output);
			if (expectedCode === 0) assert.equal(data.numPassedTests, 1, output);
			else assert.ok(JSON.stringify(data).includes('wrong timeout'), output);
		}
	},
);
