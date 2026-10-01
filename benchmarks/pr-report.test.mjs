import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMMENT_MARKER, compareSuite, mergeRounds, renderReport } from './pr-report.mjs';

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

// Identical runtime code on CI produced select 0.18ms -> 0.26ms: under one 0.1ms timer tick.
test('sub-millisecond timing changes within one timer tick are not verdicts', () => {
	const base = suite('js-framework', [
		{ name: 'octane-tsrx', ops: { select: timed(0.18, 0.1, 31) } },
	]);
	const head = suite('js-framework', [
		{ name: 'octane-tsrx', ops: { select: timed(0.26, 0.2, 26) } },
	]);
	assert.equal(compareSuite('js-framework', base, head).timing[0].verdict, 'within noise');
});

// Identical code on CI read slower on every row when head always ran after base.
test('runner drift across base, head, head, base rounds cancels out', () => {
	const round = (score) =>
		suite('js-framework', [{ name: 'octane-tsrx', ops: { run: timed(score, score - 0.5, 3) } }]);
	const base = mergeRounds([round(10), round(13)]);
	const head = mergeRounds([round(11), round(12)]);
	assert.equal(compareSuite('js-framework', round(10), round(11)).timing[0].verdict, 'slower');
	assert.equal(compareSuite('js-framework', base, head).timing[0].verdict, 'within noise');
});

test('a failed round fails the merged suite', () => {
	const ok = suite('js-framework', [{ name: 'octane-tsrx', ops: { run: timed(10, 9, 3) } }]);
	assert.equal(mergeRounds([ok, { ...ok, harnessExit: 1, failed: 'gate' }]).failed, 'gate');
});

test('timing verdicts never turn the headline red', () => {
	const base = {
		'js-framework': suite('js-framework', [{ name: 'octane-tsrx', ops: { run: timed(10, 9, 2) } }]),
	};
	const head = {
		'js-framework': suite('js-framework', [
			{ name: 'octane-tsrx', ops: { run: timed(13, 12, 2) } },
		]),
	};
	const body = renderReport({ suites: ['js-framework'], base, head });
	assert.match(body, /🟡 js-framework: 1 timed operation\(s\) possibly slower/);
	assert.doesNotMatch(body, /🔴/);
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
	assert.match(body, /❌ bundle-size failed on this pull request/);
	assert.match(body, /void-root lost/);
});

test('a suite that failed on the base commit keeps the headline from reporting green', () => {
	const head = {
		'bundle-size': suite('bundle-size', [{ name: 'octane-tsrx', ops: { js_gzip: bytes(1000) } }]),
	};
	const base = {
		'bundle-size': { ...suite('bundle-size', []), harnessExit: 1, failed: 'build broke' },
	};
	const body = renderReport({ suites: ['bundle-size'], base, head });
	assert.match(body, /⚠️ bundle-size failed on the base commit and was not compared/);
	assert.doesNotMatch(body, /🟢 No size increases/);
});

test('an unchanged pull request reports no regressions', () => {
	const results = {
		'bundle-size': suite('bundle-size', [{ name: 'octane-tsrx', ops: { js_gzip: bytes(1000) } }]),
	};
	const body = renderReport({ suites: ['bundle-size'], base: results, head: results });
	assert.match(body, /🟢 No size increases and no timing regressions outside noise\./);
	assert.match(body, /No changes across 1 measured values\./);
});
