import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	COMMENT_MARKER,
	analyzeReport,
	compareSuite,
	findBudgetBreaches,
	renderReport,
	timingVerdict,
} from './pr-report.mjs';

const bytes = (value) => ({ median: value, min: value, samples: 1 });
const paired = (ratio, low, high) => ({ ratio, low, high, pairs: 30 });
const timed = (score, pair) => ({
	score,
	median: score,
	min: score,
	samples: 30,
	...(pair ? { paired: pair } : null),
});
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

test('growth within the committed budget is reported but does not fail', () => {
	const base = {
		'bundle-size': suite('bundle-size', [
			{ name: 'octane-tsrx', ops: { js_gzip: bytes(1000) } },
			{ name: 'octane-tsrx-budget', ops: { js_gzip: bytes(1032) } },
		]),
	};
	const head = {
		'bundle-size': suite('bundle-size', [
			{ name: 'octane-tsrx', ops: { js_gzip: bytes(1032) } },
			{ name: 'octane-tsrx-budget', ops: { js_gzip: bytes(1032) } },
		]),
	};
	const { body, failures } = analyzeReport({ suites: ['bundle-size'], base, head });
	assert.deepEqual(failures, []);
	assert.match(body, /🔴 bundle-size: 1 value\(s\) increased within budget/);
});

test('a byte value over its same-run budget fails the report', () => {
	const head = suite('bundle-reachability', [
		{ name: 'hydrate-root', ops: { raw: bytes(1000), gzip: bytes(433), brotli: bytes(380) } },
		{
			name: 'hydrate-root-budget',
			ops: { raw: bytes(1032), gzip: bytes(432), brotli: bytes(400) },
		},
		{ name: 'context', ops: { gzip: bytes(999) } },
	]);
	assert.deepEqual(findBudgetBreaches(head), [
		{ target: 'hydrate-root', op: 'gzip', value: 433, limit: 432 },
	]);
	const { body, failures } = analyzeReport({
		suites: ['bundle-reachability'],
		base: { 'bundle-reachability': head },
		head: { 'bundle-reachability': head },
	});
	assert.deepEqual(failures, ['❌ bundle-reachability: 1 value(s) exceed their committed budget']);
	assert.match(body, /\| hydrate-root \| gzip \| 433 \| 432 \| \+1 \|/);
	assert.match(body, /separate pull request/);
});

test('a value over its budget is not also reported as growth within budget', () => {
	const base = suite('bundle-size', [
		{ name: 'octane-tsrx', ops: { js_gzip: bytes(1000), app_gzip: bytes(400) } },
		{ name: 'octane-tsrx-budget', ops: { js_gzip: bytes(1032), app_gzip: bytes(432) } },
	]);
	const head = suite('bundle-size', [
		{ name: 'octane-tsrx', ops: { js_gzip: bytes(1100), app_gzip: bytes(410) } },
		{ name: 'octane-tsrx-budget', ops: { js_gzip: bytes(1032), app_gzip: bytes(432) } },
	]);
	const { body, failures } = analyzeReport({
		suites: ['bundle-size'],
		base: { 'bundle-size': base },
		head: { 'bundle-size': head },
	});
	assert.deepEqual(failures, ['❌ bundle-size: 1 value(s) exceed their committed budget']);
	assert.match(body, /🔴 bundle-size: 1 value\(s\) increased within budget/);
});

test('a budget breach still fails when the base could not be measured', () => {
	const head = suite('bundle-size', [
		{ name: 'octane-tsrx', ops: { js_gzip: bytes(1100) } },
		{ name: 'octane-tsrx-budget', ops: { js_gzip: bytes(1032) } },
	]);
	const { failures } = analyzeReport({
		suites: ['bundle-size'],
		base: { 'bundle-size': { ...suite('bundle-size', []), harnessExit: 1, failed: 'base broke' } },
		head: { 'bundle-size': head },
	});
	assert.deepEqual(failures, ['❌ bundle-size: 1 value(s) exceed their committed budget']);
});

test('any increase in a js-framework work counter fails, and a decrease does not', () => {
	const work = (calls, dom) =>
		suite('js-framework', [
			{ name: 'octane-tsrx', ops: { calls_update: bytes(calls), dom_update: bytes(dom) } },
		]);
	const more = analyzeReport({
		suites: ['js-framework'],
		base: { 'js-framework': work(5000, 100) },
		head: { 'js-framework': work(5001, 100) },
	});
	assert.deepEqual(more.failures, ['❌ js-framework: 1 work counter(s) increased']);
	assert.match(more.body, /\| octane-tsrx \| calls_update \| 5,000 \| 5,001 \| \+1/);
	const fewer = analyzeReport({
		suites: ['js-framework'],
		base: { 'js-framework': work(5000, 100) },
		head: { 'js-framework': work(4000, 90) },
	});
	assert.deepEqual(fewer.failures, []);
});

test('unchanged work counters are confirmed beside the timing table', () => {
	const result = suite('js-framework', [
		{ name: 'octane-tsrx', ops: { run: timed(10), calls_run: bytes(34091), dom_run: bytes(2000) } },
	]);
	const { body, failures } = analyzeReport({
		suites: ['js-framework'],
		base: { 'js-framework': result },
		head: { 'js-framework': result },
	});
	assert.deepEqual(failures, []);
	assert.match(body, /All 2 work counters are unchanged\./);
});

test('a paired timing verdict needs the whole 95% interval beyond ±3%', () => {
	assert.equal(timingVerdict(paired(1.06, 1.031, 1.09)), 'slower');
	assert.equal(timingVerdict(paired(1.06, 1.029, 1.09)), 'within noise');
	assert.equal(timingVerdict(paired(0.94, 0.9, 0.969)), 'faster');
	assert.equal(timingVerdict(paired(0.94, 0.9, 0.971)), 'within noise');
	assert.equal(timingVerdict(paired(1, 0.99, 1.01)), 'within noise');
	assert.equal(timingVerdict(null), 'unpaired');
});

// A 2ms looped sample read +5.3% when every pair differed by one 0.1ms tick.
test('a shift smaller than two timer ticks of the sample is never a verdict', () => {
	const shifted = paired(1.0526, 1.0476, 1.098);
	assert.equal(timingVerdict(shifted, 2), 'within noise');
	assert.equal(timingVerdict(shifted, 20), 'slower');
	assert.equal(timingVerdict(paired(1.06, 1.04, 1.08), 3), 'within noise');
	assert.equal(timingVerdict(paired(1.08, 1.05, 1.1), 3), 'slower');
});

test('timing verdicts are reported but never fail the report', () => {
	const result = (score, pair) =>
		suite('js-framework', [{ name: 'octane-tsrx', ops: { run: timed(score, pair) } }]);
	const { body, failures } = analyzeReport({
		suites: ['js-framework'],
		base: { 'js-framework': result(10) },
		head: { 'js-framework': result(13, paired(1.3, 1.2, 1.4)) },
	});
	assert.deepEqual(failures, []);
	assert.match(body, /🟡 js-framework: 1 timed operation\(s\) slower beyond ±3%/);
	assert.match(
		body,
		/\| octane-tsrx \| run \| 10\.000 \| 13\.000 \| \+30\.0% \| \+20\.0% … \+40\.0% \|/,
	);
	assert.doesNotMatch(body, /❌/);
});

test('a suite that failed on the pull request fails the report with its error', () => {
	const base = {
		'js-framework': suite('js-framework', [{ name: 'octane-tsrx', ops: { run: timed(10) } }]),
		'bundle-size': suite('bundle-size', [{ name: 'octane-tsrx', ops: { js_gzip: bytes(1000) } }]),
	};
	const head = {
		'js-framework': suite('js-framework', [{ name: 'octane-tsrx', ops: { run: timed(13) } }]),
		'bundle-size': { ...suite('bundle-size', []), harnessExit: 1, failed: 'void-root lost' },
	};
	const { body, failures } = analyzeReport({ suites: ['js-framework', 'bundle-size'], base, head });
	assert.ok(body.startsWith(COMMENT_MARKER));
	assert.deepEqual(failures, ['❌ bundle-size failed on this pull request']);
	assert.match(body, /void-root lost/);
});

test('a suite that failed on the base commit keeps the headline from reporting green', () => {
	const head = {
		'bundle-size': suite('bundle-size', [{ name: 'octane-tsrx', ops: { js_gzip: bytes(1000) } }]),
	};
	const base = {
		'bundle-size': { ...suite('bundle-size', []), harnessExit: 1, failed: 'build broke' },
	};
	const { body, failures } = analyzeReport({ suites: ['bundle-size'], base, head });
	assert.deepEqual(failures, []);
	assert.match(body, /⚠️ bundle-size failed on the base commit and was not compared/);
	assert.doesNotMatch(body, /🟢 No budget breaches/);
});

test('a missing result fails the pull request side', () => {
	const ok = suite('js-framework', [{ name: 'octane-tsrx', ops: { run: timed(10) } }]);
	const { failures } = analyzeReport({
		suites: ['js-framework'],
		base: { 'js-framework': ok },
		head: { 'js-framework': null },
	});
	assert.deepEqual(failures, ['❌ js-framework failed on this pull request']);
});

test('the header names the first-parent base and how far main moved past the recorded base', () => {
	const results = {
		'bundle-size': suite('bundle-size', [{ name: 'octane-tsrx', ops: { js_gzip: bytes(1000) } }]),
	};
	const body = renderReport({
		suites: ['bundle-size'],
		base: results,
		head: results,
		baseSha: 'a'.repeat(40),
		eventBaseSha: 'b'.repeat(40),
		drift: '3',
		headSha: 'c'.repeat(40),
	});
	assert.match(
		body,
		/Compares `aaaaaaaaa`, the merge commit's first parent \(main has moved 3 commit\(s\) past the pull request's recorded base `bbbbbbbbb`\) with `ccccccccc`/,
	);
	const current = renderReport({
		suites: ['bundle-size'],
		base: results,
		head: results,
		baseSha: 'a'.repeat(40),
		eventBaseSha: 'a'.repeat(40),
	});
	assert.doesNotMatch(current, /recorded base/);
});

test('an unchanged pull request reports no regressions', () => {
	const results = {
		'bundle-size': suite('bundle-size', [{ name: 'octane-tsrx', ops: { js_gzip: bytes(1000) } }]),
	};
	const { body, failures } = analyzeReport({
		suites: ['bundle-size'],
		base: results,
		head: results,
	});
	assert.deepEqual(failures, []);
	assert.match(body, /🟢 No budget breaches, no added work, and no timing changes beyond ±3%\./);
	assert.match(body, /No changes across 1 measured values\./);
});
