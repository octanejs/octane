// Pull request CI timing: compares the duration of every CI job on a pull
// request's head commit with recent successful `main` push runs, so a toolchain
// change reports its before/after cost per job. The trusted
// .github/workflows/pr-bench-comment.yml renders it into the sticky benchmark
// comment from Actions API data only; it never runs pull request code.
//
// Runner speed varies between jobs, so a job is only called slower or faster
// outside the whole baseline range and by at least MIN_PERCENT and MIN_SECONDS.

import { COMMENT_MARKER } from './pr-report.mjs';

export const GATE_JOB = 'classify changeset release'; // draft and closed-event runs skip it with every expensive job
export const BASELINE_RUNS = 5;
const MIN_PERCENT = 10;
const MIN_SECONDS = 15;
const COMMENT_LIMIT = 65_000; // GitHub rejects comment bodies over 65,536 characters
const WALL_CLOCK = 'wall clock (first job start to last job end)';
const JOB_TIME = 'total job time';
const PENDING_BENCH = [
	COMMENT_MARKER,
	'## Benchmark report',
	'',
	'_No benchmark report for this commit yet: PR bench is still running or skipped this change._',
	'',
].join('\n');

export const ranGatedJobs = (jobs) =>
	jobs.some((job) => job.name === GATE_JOB && job.conclusion === 'success');

export function summarizeJobs(jobs) {
	const durations = new Map();
	let start = Infinity;
	let end = -Infinity;
	for (const job of jobs) {
		if (job.conclusion !== 'success' || !job.started_at || !job.completed_at) continue;
		const started = Date.parse(job.started_at);
		const completed = Date.parse(job.completed_at);
		const setup = job.steps?.find((step) => step.name === 'Set up job')?.completed_at;
		durations.set(job.name, (completed - (setup ? Date.parse(setup) : started)) / 1000); // runner provisioning is queue time, not job cost
		start = Math.min(start, started);
		end = Math.max(end, completed);
	}
	if (durations.size === 0) return { durations, wallClock: null, jobTime: null };
	const jobTime = [...durations.values()].reduce((sum, value) => sum + value, 0);
	return { durations, wallClock: (end - start) / 1000, jobTime };
}

// Release merges and path-scoped runs skip jobs; only the most complete runs are a fair baseline.
export function selectBaselines(summaries, count = BASELINE_RUNS) {
	const widest = Math.max(0, ...summaries.map((summary) => summary.durations.size));
	return summaries.filter((summary) => summary.durations.size === widest).slice(0, count);
}

function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function compareValue(name, after, before) {
	if (before.length === 0) return { name, after, verdict: 'new' };
	const base = median(before);
	const min = Math.min(...before);
	const max = Math.max(...before);
	const delta = after - base;
	const percent = base === 0 ? 0 : (delta / base) * 100;
	const beyond = Math.abs(delta) >= MIN_SECONDS && Math.abs(percent) >= MIN_PERCENT;
	const verdict =
		beyond && after > max ? 'slower' : beyond && after < min ? 'faster' : 'within noise';
	return { name, after, median: base, min, max, delta, percent, verdict };
}

export function compareCiTiming(head, baselines) {
	const jobs = [...head.durations].map(([name, after]) =>
		compareValue(
			name,
			after,
			baselines.flatMap((run) => (run.durations.has(name) ? [run.durations.get(name)] : [])),
		),
	);
	const missing = [...new Set(baselines.flatMap((run) => [...run.durations.keys()]))].filter(
		(name) => !head.durations.has(name),
	);
	const total = (name, key) => {
		const row = compareValue(
			name,
			head[key],
			baselines.map((run) => run[key]).filter((value) => value != null),
		);
		return missing.length && row.verdict !== 'new' ? { ...row, verdict: 'partial run' } : row;
	};
	return { totals: [total(WALL_CLOCK, 'wallClock'), total(JOB_TIME, 'jobTime')], jobs, missing };
}

const ICON = {
	slower: '🟡',
	faster: '🟢',
	'within noise': '⚪',
	'partial run': '⚪',
	new: '🆕',
};

function formatDuration(seconds) {
	const rounded = Math.round(seconds);
	return rounded >= 60
		? `${Math.floor(rounded / 60)}m ${String(rounded % 60).padStart(2, '0')}s`
		: `${rounded}s`;
}

function renderRow(row) {
	if (row.verdict === 'new') {
		return `| ${row.name} | – | – | ${formatDuration(row.after)} | – | ${ICON.new} new |`;
	}
	const sign = row.delta > 0 ? '+' : row.delta < 0 ? '−' : '±';
	return (
		`| ${row.name} | ${formatDuration(row.median)} | ${formatDuration(row.min)}–${formatDuration(row.max)} | ` +
		`${formatDuration(row.after)} | ${sign}${formatDuration(Math.abs(row.delta))} (${sign}${Math.abs(row.percent).toFixed(0)}%) | ` +
		`${ICON[row.verdict]} ${row.verdict} |`
	);
}

const HEADER = [
	'| job | `main` median | `main` range | this PR | Δ | |',
	'| --- | ---: | ---: | ---: | ---: | --- |',
];

export function renderCiTiming({ head, baselines, headSha, runUrl, conclusion }) {
	const { totals, jobs, missing } = compareCiTiming(head, baselines);
	const byDelta = [...jobs].sort((a, b) => (b.delta ?? Infinity) - (a.delta ?? Infinity));
	const moved = byDelta.filter((row) => row.verdict === 'slower' || row.verdict === 'faster');
	const named = (verdict) => moved.filter((row) => row.verdict === verdict).map((row) => row.name);
	const slower = named('slower');
	const faster = named('faster');
	const summary = [
		...(slower.length
			? [`- 🟡 ${slower.length} job(s) slower than every recent \`main\` run: ${slower.join(', ')}`]
			: []),
		...(faster.length
			? [`- 🟢 ${faster.length} job(s) faster than every recent \`main\` run: ${faster.join(', ')}`]
			: []),
	];
	const commit = headSha ? '`' + headSha.slice(0, 9) + '`' : 'this pull request';
	return [
		'### CI job durations',
		'',
		...(summary.length ? summary : ['⚪ No job outside the range of recent `main` runs.']),
		'',
		`Compares the CI run for ${commit}${runUrl ? ` ([run](${runUrl}))` : ''} with the last ${baselines.length} successful \`main\` push runs. ` +
			`A job is only slower or faster outside the whole \`main\` range, by at least ${MIN_PERCENT}% and ${MIN_SECONDS}s. Job time excludes runner setup.`,
		...(conclusion && conclusion !== 'success'
			? ['', `The run concluded \`${conclusion}\`; only successful jobs are timed.`]
			: []),
		'',
		...HEADER,
		...totals.map(renderRow),
		...moved.map(renderRow),
		...(missing.length
			? [
					'',
					`Not compared (skipped, failed, or not run on this pull request): ${missing.join(', ')}.`,
				]
			: []),
		'',
		'<details>',
		`<summary>All ${jobs.length} timed jobs</summary>`,
		'',
		...HEADER,
		...byDelta.map(renderRow),
		'',
		'</details>',
		'',
	].join('\n');
}

export const isBenchReport = (body) =>
	typeof body === 'string' && body.startsWith(COMMENT_MARKER) && body.length <= COMMENT_LIMIT;

export function composeComment({ bench, ciTiming }) {
	const report = bench ?? PENDING_BENCH;
	if (!ciTiming) return report;
	const room = COMMENT_LIMIT - ciTiming.length - 2;
	return [report.length > room ? report.slice(0, room) : report, ciTiming].join('\n\n');
}
