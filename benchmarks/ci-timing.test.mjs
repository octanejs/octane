import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	compareCiTiming,
	composeComment,
	isBenchReport,
	ranGatedJobs,
	renderCiTiming,
	selectBaselines,
	summarizeJobs,
} from './ci-timing.mjs';
import { COMMENT_MARKER } from './pr-report.mjs';

const T0 = Date.parse('2026-10-01T00:00:00Z');
const job = (name, startSeconds, seconds, conclusion = 'success') => ({
	name,
	conclusion,
	started_at: new Date(T0 + startSeconds * 1000).toISOString(),
	completed_at: new Date(T0 + (startSeconds + seconds) * 1000).toISOString(),
});
const run = (durations) => summarizeJobs(durations.map(([name, seconds]) => job(name, 0, seconds)));

test('only successful jobs are timed, and wall clock spans first start to last end', () => {
	const summary = summarizeJobs([
		job('classify changeset release', 0, 20),
		job('lint checks', 30, 400),
		job('test shard (Node 24, ${{ matrix.shard }})', 0, 0, 'skipped'),
		job('typecheck checks', 30, 500, 'failure'),
	]);
	assert.deepEqual(
		[...summary.durations],
		[
			['classify changeset release', 20],
			['lint checks', 400],
		],
	);
	assert.equal(summary.wallClock, 430);
	assert.equal(summary.jobTime, 420);
});

test('draft and closed-event runs, which skip the gate job, are not timed', () => {
	assert.equal(
		ranGatedJobs([job('lint', 0, 3), job('classify changeset release', 0, 0, 'skipped')]),
		false,
	);
	assert.equal(ranGatedJobs([job('classify changeset release', 0, 15)]), true);
});

test('baselines skip main runs that ran fewer jobs, such as release merges', () => {
	const full = (seconds) =>
		run([
			['lint checks', seconds],
			['typecheck checks', seconds],
		]);
	const release = run([['lint checks', 5]]);
	const picked = selectBaselines([full(400), release, full(410), full(420)], 2);
	assert.deepEqual(
		picked.map((summary) => summary.durations.get('lint checks')),
		[400, 410],
	);
});

test('a job is slower or faster only outside the whole baseline range and both thresholds', () => {
	const baselines = [
		run([
			['lint checks', 400],
			['typecheck checks', 480],
			['example apps (1/3)', 200],
		]),
		run([
			['lint checks', 420],
			['typecheck checks', 500],
			['example apps (1/3)', 210],
		]),
		run([
			['lint checks', 440],
			['typecheck checks', 520],
			['example apps (1/3)', 220],
		]),
	];
	const head = run([
		['lint checks', 120],
		['typecheck checks', 530],
		['example apps (1/3)', 240],
		['bun install', 30],
	]);
	const verdicts = Object.fromEntries(
		compareCiTiming(head, baselines).jobs.map((row) => [row.name, row.verdict]),
	);
	assert.deepEqual(verdicts, {
		'lint checks': 'faster',
		'typecheck checks': 'within noise', // above the range, but +30s is under 10%
		'example apps (1/3)': 'slower',
		'bun install': 'new',
	});
});

test('totals are not judged when baseline jobs are missing from the pull request run', () => {
	const baselines = [
		run([
			['lint checks', 400],
			['test shard (Node 24, 1/4)', 600],
		]),
	];
	const scoped = compareCiTiming(run([['lint checks', 100]]), baselines);
	assert.deepEqual(scoped.missing, ['test shard (Node 24, 1/4)']);
	assert.deepEqual(
		scoped.totals.map((row) => row.verdict),
		['partial run', 'partial run'],
	);
	const markdown = renderCiTiming({
		head: run([['lint checks', 100]]),
		baselines,
		headSha: 'a'.repeat(40),
	});
	assert.match(
		markdown,
		/Not compared \(skipped, failed, or not run on this pull request\): test shard/,
	);
	assert.match(markdown, /🟢 1 job\(s\) faster than every recent `main` run: lint checks/);
});

test('the comment keeps the CI section when the benchmark report is missing or oversized', () => {
	const ciTiming = '### CI job durations\n';
	const pending = composeComment({ bench: null, ciTiming });
	assert.ok(pending.startsWith(COMMENT_MARKER));
	assert.ok(pending.endsWith(ciTiming));
	const huge = composeComment({ bench: COMMENT_MARKER + 'x'.repeat(70_000), ciTiming });
	assert.ok(huge.length <= 65_000);
	assert.ok(huge.endsWith(ciTiming));
	assert.equal(isBenchReport(COMMENT_MARKER + '\n## Benchmark report'), true);
	assert.equal(isBenchReport('## Benchmark report'), false);
});
