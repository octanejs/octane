import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMMENT_MARKER, compareSuite, renderReport } from './pr-report.mjs';

const bytes = (value) => ({ median: value, min: value, samples: 1 });
const timed = (score, min, rme) => ({ score, median: score, min, rme, scoreRme: rme, samples: 8 });
const suite = (name, targets) => ({ suite: name, iterations: 1, harnessExit: 0, targets });

test('bundle byte changes are reported exactly while budget peers stay hidden', () => {
	const base = suite('bundle-size', [
		{ name: 'octane-tsrx', ops: { js_gzip: bytes(1000), app_gzip: bytes(400) } },
		{ name: 'octane-tsrx-budget', ops: { js_gzip: bytes(1200) } },
		{ name: 'react', ops: { js_gzip: bytes(9000) } },
	]);
	const head = suite('bundle-size', [
		{ name: 'octane-tsrx', ops: { js_gzip: bytes(1012), app_gzip: bytes(400) } },
		{ name: 'octane-tsrx-budget', ops: { js_gzip: bytes(1300) } },
		{ name: 'react', ops: { js_gzip: bytes(9100) } },
	]);
	const { deterministic, timing, unchanged } = compareSuite('bundle-size', base, head);
	assert.deepEqual(
		deterministic.map(({ target, op, verdict }) => [target, op, verdict]),
		[['octane-tsrx', 'js_gzip', 'larger']],
	);
	assert.equal(timing.length, 0);
	assert.equal(unchanged, 1);
});

test('timing deltas inside the combined margin of error are not verdicts', () => {
	const base = suite('js-framework', [{ name: 'octane-tsrx', ops: { run: timed(10, 9, 4) } }]);
	const noisy = suite('js-framework', [{ name: 'octane-tsrx', ops: { run: timed(11, 10, 20) } }]);
	const slower = suite('js-framework', [{ name: 'octane-tsrx', ops: { run: timed(12, 11, 3) } }]);
	const fastestUnmoved = suite('js-framework', [
		{ name: 'octane-tsrx', ops: { run: timed(12, 8, 3) } },
	]);
	const verdict = (head) => compareSuite('js-framework', base, head).timing[0].verdict;
	assert.equal(verdict(noisy), 'within noise');
	assert.equal(verdict(slower), 'slower');
	assert.equal(verdict(fastestUnmoved), 'within noise');
});

test('the report flags regressions and failed pull request suites', () => {
	const base = {
		'js-framework': suite('js-framework', [{ name: 'octane-tsrx', ops: { run: timed(10, 9, 2) } }]),
		'bundle-size': suite('bundle-size', [{ name: 'octane-tsrx', ops: { js_gzip: bytes(1000) } }]),
	};
	const head = {
		'js-framework': suite('js-framework', [
			{ name: 'octane-tsrx', ops: { run: timed(13, 12, 2) } },
		]),
		'bundle-size': { ...suite('bundle-size', []), harnessExit: 1, failed: 'void-root lost' },
	};
	const body = renderReport({ suites: ['js-framework', 'bundle-size'], base, head });
	assert.ok(body.startsWith(COMMENT_MARKER));
	assert.match(body, /🔴 js-framework: 1 operation\(s\) slower/);
	assert.match(body, /❌ bundle-size failed on this pull request/);
	assert.match(body, /void-root lost/);
});

test('an unchanged pull request reports no regressions', () => {
	const results = {
		'bundle-size': suite('bundle-size', [{ name: 'octane-tsrx', ops: { js_gzip: bytes(1000) } }]),
	};
	const body = renderReport({ suites: ['bundle-size'], base: results, head: results });
	assert.match(body, /🟢 No size increases and no timing regressions outside noise\./);
	assert.match(body, /No changes across 1 measured values\./);
});
