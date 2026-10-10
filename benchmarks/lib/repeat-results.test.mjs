import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeReport, compareSuite } from '../pr-report.mjs';
import { summarizeRuns } from './repeat-results.mjs';

function run(score = 10, min = score - 1) {
	return {
		suite: 'fixture',
		iterations: 8,
		targets: [{ name: 'octane', ops: { update: { score, min, median: score, samples: 8 } } }],
		harnessExit: 0,
	};
}

test('a slow repetition cannot dominate the score or replace the observed spread', () => {
	const result = summarizeRuns([run(10, 8), run(100, 90), run(12, 9)]);
	const stat = result.targets[0].ops.update;
	assert.equal(result.repetitions, 3);
	assert.equal(result.harnessExit, 0);
	assert.equal(stat.score, 12);
	assert.equal(stat.median, 12);
	assert.equal(stat.min, 9);
	assert.equal(stat.scoreKind, 'run-median');
	assert.deepEqual(stat.betweenRuns.scores, [10, 100, 12]);
	assert.equal(stat.betweenRuns.min, 10);
	assert.equal(stat.betweenRuns.max, 100);
	assert.ok(stat.betweenRuns.cvPercent > 100);
});

test('even repetition counts average both middle scores and both middle minima', () => {
	const stat = summarizeRuns([run(10, 6), run(20, 12), run(12, 8), run(14, 10)]).targets[0].ops
		.update;
	assert.equal(stat.score, 13);
	assert.equal(stat.min, 9);
});

test('source distributions and changing metadata remain attached to their original runs', () => {
	const runs = [run(), run(12)];
	runs[0].meta = { cpu: 'first' };
	runs[1].meta = { cpu: 'second' };
	runs[0].targets[0].meta = { domNodes: 100 };
	runs[1].targets[0].meta = { domNodes: 101 };
	Object.assign(runs[0].targets[0].ops.update, { p95: 18, sd: 2, rme: 5 });
	Object.assign(runs[1].targets[0].ops.update, { p95: 20, sd: 3, rme: 6 });
	const original = structuredClone(runs);
	const result = summarizeRuns(runs);
	assert.deepEqual(result.runs, original);
	assert.deepEqual(runs, original);
	assert.equal('meta' in result, false);
	assert.equal('meta' in result.targets[0], false);
	for (const field of ['p95', 'sd', 'rme', 'samples']) {
		assert.equal(field in result.targets[0].ops.update, false);
	}
});

test('target and operation order may change without changing their identity', () => {
	const first = run();
	first.targets[0].ops.mount = { score: 20, min: 18 };
	first.targets.push({ name: 'react', ops: { update: { median: 20, min: 19 } } });
	const second = structuredClone(first);
	second.targets.reverse();
	second.targets[1].ops = { mount: { score: 22, min: 19 }, update: { score: 12, min: 10 } };
	const result = summarizeRuns([first, second]);
	assert.deepEqual(
		result.targets.map((target) => target.name),
		['octane', 'react'],
	);
	assert.equal(result.targets[0].ops.update.score, 11);
	assert.equal(result.targets[0].ops.mount.score, 21);
	assert.equal(result.targets[1].ops.update.median, 20);
	assert.equal('score' in result.targets[1].ops.update, false);
});

test('legacy count and byte operations retain their units and expose discrepancies', () => {
	const runs = [100, 100, 101].map((value) => ({
		...run(),
		targets: [{ name: 'octane', ops: { bytes: { median: value, min: value, samples: 1 } } }],
	}));
	const stat = summarizeRuns(runs).targets[0].ops.bytes;
	assert.equal(stat.median, 100);
	assert.equal('score' in stat, false);
	assert.equal(stat.min, 100);
	assert.deepEqual(stat.betweenRuns.scores, [100, 100, 101]);
	assert.equal(stat.betweenRuns.max, 101);
	assert.ok(stat.betweenRuns.cvPercent > 0);
});

test('repeated production counters still fail the existing PR report work gate when they increase', () => {
	const counter = (value) => ({
		...run(),
		suite: 'js-framework',
		targets: [
			{
				name: 'octane-tsrx',
				ops: { production_calls_1k: { median: value, min: value, samples: 1 } },
			},
		],
	});
	const base = summarizeRuns([counter(100), counter(100), counter(100)]);
	const head = summarizeRuns([counter(101), counter(101), counter(101)]);
	const compared = compareSuite('js-framework', base, head);
	assert.equal(compared.timing.length, 0);
	assert.deepEqual(
		compared.deterministic.map(({ op, before, after, verdict }) => ({
			op,
			before,
			after,
			verdict,
		})),
		[{ op: 'production_calls_1k', before: 100, after: 101, verdict: 'larger' }],
	);
	const report = analyzeReport({
		suites: ['js-framework'],
		base: { 'js-framework': base },
		head: { 'js-framework': head },
	});
	assert.equal(report.failures.length, 1);
	assert.match(report.failures[0], /work counter\(s\) increased/);
});

test('repetitions cannot change between scored timings and median-only counters', () => {
	const timed = run();
	const counter = run();
	delete counter.targets[0].ops.update.score;
	assert.throws(() => summarizeRuns([timed, counter]), /score kind changed/);
	assert.throws(() => summarizeRuns([counter, timed]), /score kind changed/);
});

test('zero counters have zero dispersion and coefficients remain JSON-safe', () => {
	const zero = summarizeRuns([run(0, 0), run(0, 0)]).targets[0].ops.update;
	assert.equal(zero.betweenRuns.cvPercent, 0);
	const balanced = summarizeRuns([run(-1, -1), run(1, 1)]).targets[0].ops.update;
	assert.equal(balanced.betweenRuns.cvPercent, null);
	assert.deepEqual(JSON.parse(JSON.stringify(balanced)), balanced);
});

test('between-run variation uses the sample deviation of run scores', () => {
	const stat = summarizeRuns([run(1, 1), run(2, 2), run(3, 3)]).targets[0].ops.update;
	assert.equal(stat.betweenRuns.cvPercent, 50);
});

test('metadata-only semantic targets remain present without fabricated measurements', () => {
	const runs = [run(), run()];
	for (const result of runs) {
		result.targets.push({ name: 'semantic-matrix', ops: {}, meta: { correctness: 'pass' } });
	}
	const result = summarizeRuns(runs);
	assert.deepEqual(result.targets[1], { name: 'semantic-matrix', ops: {} });
	assert.equal(result.runs[1].targets[1].meta.correctness, 'pass');
});

test('one failed correctness gate makes the combined result fail despite other successful runs', () => {
	const failed = { ...run(), failed: 'DOM identity changed' };
	const result = summarizeRuns([run(), failed, run()]);
	assert.equal(result.harnessExit, 1);
	assert.match(result.failed, /run 2: DOM identity changed/);
	assert.equal(result.runs[1].failed, 'DOM identity changed');
});

test('nonzero harness exits propagate independently of a reported correctness failure', () => {
	const result = summarizeRuns([run(), { ...run(), harnessExit: 2 }, { ...run(), failed: 'gate' }]);
	assert.equal(result.harnessExit, 2);
	assert.match(result.failed, /run 2: harness exited 2/);
	assert.match(result.failed, /run 3: gate/);
});

for (const [name, modify, expected] of [
	[
		'suite name',
		(value) => {
			value.suite = 'other';
		},
		/suite or iteration count changed/,
	],
	[
		'iteration count',
		(value) => {
			value.iterations = 3;
		},
		/suite or iteration count changed/,
	],
	[
		'missing target',
		(value) => {
			value.targets = [];
		},
		/missing targets/,
	],
	[
		'renamed target',
		(value) => {
			value.targets[0].name = 'other';
		},
		/target set changed/,
	],
	[
		'extra target',
		(value) => {
			value.targets.push({ name: 'extra', ops: {} });
		},
		/target set changed/,
	],
	[
		'duplicate target',
		(value) => {
			value.targets.push(value.targets[0]);
		},
		/duplicate target/,
	],
	[
		'missing operation',
		(value) => {
			delete value.targets[0].ops.update;
		},
		/operation set changed/,
	],
	[
		'extra operation',
		(value) => {
			value.targets[0].ops.mount = { score: 1, min: 1 };
		},
		/operation set changed/,
	],
]) {
	test(`rejects a changed ${name} instead of dropping unmatched measurements`, () => {
		const changed = run();
		modify(changed);
		assert.throws(() => summarizeRuns([run(), changed]), expected);
	});
}

test('malformed result structures are rejected before aggregation', () => {
	for (const value of [undefined, null, {}, [], [null], [{ targets: [] }]]) {
		assert.throws(() => summarizeRuns(value));
	}
	for (const modify of [
		(value) => {
			value.targets = {};
		},
		(value) => {
			value.targets = [null];
		},
		(value) => {
			value.targets[0].name = '';
		},
		(value) => {
			delete value.targets[0].ops;
		},
		(value) => {
			value.targets[0].ops = [];
		},
		(value) => {
			value.harnessExit = NaN;
		},
	]) {
		const value = run();
		modify(value);
		assert.throws(() => summarizeRuns([value]));
	}
});

test('invalid measured values cannot disappear into a successful median', () => {
	for (const field of ['score', 'min']) {
		for (const value of [NaN, Infinity, -Infinity, '10']) {
			const invalid = run();
			invalid.targets[0].ops.update[field] = value;
			assert.throws(() => summarizeRuns([run(), invalid, run()]), /finite score and minimum/);
		}
	}
	const missing = run();
	delete missing.targets[0].ops.update.min;
	assert.throws(() => summarizeRuns([missing]), /finite score and minimum/);
	missing.targets[0].ops.update = { min: 1 };
	assert.throws(() => summarizeRuns([missing]), /finite score and minimum/);
	missing.targets[0].ops.update = null;
	assert.throws(() => summarizeRuns([missing]), /finite score and minimum/);
});
