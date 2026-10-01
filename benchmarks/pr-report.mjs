// Pull request benchmark report: compares BENCH_JSON suite results collected
// from a pull request's base commit and its merge commit on the same runner, and
// renders the Markdown posted as the pull request's sticky comment.
//
// Run: node benchmarks/pr-report.mjs --base=<dir>[,<dir>] --head=<dir>[,<dir>] [--out=<file>]
//
// Several directories per side are rounds of the same commit. CI measures
// js-framework base, head, head, base so linear runner drift cancels in each
// side's mean; disagreement between rounds widens the margin of error.
//
// Deterministic operations (bytes, DOM-operation and call counts) report every
// change exactly. A timing operation is only called faster or slower outside its
// combined relative margin of error, never under a 5% floor, by more than one
// 0.1ms Chromium timer tick, and only when the fastest sample moved the same
// way. Even then one shared CI runner is noisy, so timing verdicts stay yellow.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMMENT_MARKER = '<!-- octane-pr-bench -->';
export const SUITES = ['js-framework', 'bundle-size', 'bundle-reachability'];
const TIMING_FLOOR_PERCENT = 5;
const TIMER_TICK_MS = 0.1;
const DETAIL_LIMIT = 2000;
const COMMENT_LIMIT = 60_000; // GitHub rejects comment bodies over 65,536 characters

const SUITE_INFO = {
	'js-framework': {
		title: 'js-framework: 1k/10k row operations (ms, lower is better)',
		reports: (name) => name.startsWith('octane-'),
	},
	'bundle-size': {
		title: 'Application bundle size (bytes)',
		reports: (name) => name.startsWith('octane-') && !name.endsWith('-budget'),
	},
	'bundle-reachability': {
		title: 'Public-import reachability bundles (bytes)',
		reports: (name) => !name.endsWith('-budget'),
	},
};

const isTiming = (stat) => typeof stat?.score === 'number';
const valueOf = (stat) => stat?.score ?? stat?.median;
const rmeOf = (stat) => stat.scoreRme ?? stat.rme ?? 0;

export function compareSuite(suite, base, head) {
	const reports = SUITE_INFO[suite]?.reports ?? (() => true);
	const baseTargets = new Map((base?.targets ?? []).map((target) => [target.name, target]));
	const deterministic = [];
	const timing = [];
	let unchanged = 0;
	for (const target of head?.targets ?? []) {
		if (!reports(target.name)) continue;
		const baseTarget = baseTargets.get(target.name);
		for (const [op, headStat] of Object.entries(target.ops)) {
			const baseStat = baseTarget?.ops[op];
			const before = valueOf(baseStat);
			const after = valueOf(headStat);
			if (typeof after !== 'number') continue;
			if (typeof before !== 'number') {
				deterministic.push({
					target: target.name,
					op,
					before: null,
					after,
					percent: null,
					verdict: 'new',
				});
				continue;
			}
			const percent = before === 0 ? 0 : ((after - before) / before) * 100;
			const row = { target: target.name, op, before, after, percent };
			if (isTiming(headStat) && isTiming(baseStat)) {
				const noise = Math.max(TIMING_FLOOR_PERCENT, Math.hypot(rmeOf(baseStat), rmeOf(headStat)));
				const resolvable = Math.abs(after - before) > TIMER_TICK_MS;
				const verdict = !resolvable
					? 'within noise'
					: percent > noise && headStat.min > baseStat.min
						? 'slower'
						: percent < -noise && headStat.min < baseStat.min
							? 'faster'
							: 'within noise';
				timing.push({ ...row, noise, verdict });
			} else if (after !== before) {
				deterministic.push({ ...row, verdict: after > before ? 'larger' : 'smaller' });
			} else {
				unchanged++;
			}
		}
	}
	return { deterministic, timing, unchanged };
}

const formatInteger = (value) => Math.round(value).toLocaleString('en-US');
const formatSigned = (value, format) =>
	(value > 0 ? '+' : value < 0 ? '−' : '±') + format(Math.abs(value));
const formatPercent = (percent) => formatSigned(percent, (value) => `${value.toFixed(1)}%`);
const ICON = {
	slower: '🟡',
	larger: '🔴',
	faster: '🟢',
	smaller: '🟢',
	'within noise': '⚪',
	new: '🆕',
};

function renderDeterministic(rows, unchanged) {
	if (rows.length === 0) return [`No changes across ${unchanged} measured values.`];
	return [
		'| target | metric | base | head | Δ | |',
		'| --- | --- | ---: | ---: | ---: | --- |',
		...rows.map((row) =>
			row.before == null
				? `| ${row.target} | ${row.op} | – | ${formatInteger(row.after)} | – | ${ICON.new} |`
				: `| ${row.target} | ${row.op} | ${formatInteger(row.before)} | ${formatInteger(row.after)} | ` +
					`${formatSigned(row.after - row.before, formatInteger)} (${formatPercent(row.percent)}) | ${ICON[row.verdict]} |`,
		),
		'',
		`${unchanged} other measured values are unchanged.`,
	];
}

function renderTiming(rows) {
	return [
		'| target | operation | base | head | Δ | noise | |',
		'| --- | --- | ---: | ---: | ---: | ---: | --- |',
		...rows.map(
			(row) =>
				`| ${row.target} | ${row.op} | ${row.before.toFixed(2)} | ${row.after.toFixed(2)} | ` +
				`${formatPercent(row.percent)} | ±${row.noise.toFixed(0)}% | ${ICON[row.verdict]} ${row.verdict} |`,
		),
	];
}

const FENCE = '```';
const fenced = (text) => [
	FENCE,
	String(text).replaceAll(FENCE, "'''").slice(0, DETAIL_LIMIT),
	FENCE,
];
const failureOf = (result) =>
	!result
		? 'no result'
		: (result.failed ?? (result.harnessExit ? `harness exited ${result.harnessExit}` : null));
const shortSha = (sha, fallback) => (sha ? '`' + sha.slice(0, 9) + '`' : fallback);

export function renderReport({ suites = SUITES, base, head, baseSha, headSha, runUrl }) {
	const flagged = [];
	const sections = [];
	for (const suite of suites) {
		sections.push('', `### ${SUITE_INFO[suite]?.title ?? suite}`, '');
		const headFailure = failureOf(head[suite]);
		const baseFailure = failureOf(base[suite]);
		if (headFailure) {
			flagged.push(`❌ ${suite} failed on this pull request`);
			sections.push('❌ The suite failed on this pull request.', '', ...fenced(headFailure));
			continue;
		}
		if (baseFailure) {
			flagged.push(`⚠️ ${suite} failed on the base commit and was not compared`);
			sections.push(
				'⚠️ The suite failed on the base commit, so there is nothing to compare.',
				'',
				...fenced(baseFailure),
			);
			continue;
		}
		const { deterministic, timing, unchanged } = compareSuite(suite, base[suite], head[suite]);
		const larger = deterministic.filter((row) => row.verdict === 'larger').length;
		const slower = timing.filter((row) => row.verdict === 'slower').length;
		if (larger) flagged.push(`🔴 ${suite}: ${larger} value(s) increased`);
		if (slower) flagged.push(`🟡 ${suite}: ${slower} timed operation(s) possibly slower`);
		const moved = timing.filter((row) => row.verdict !== 'within noise');
		if (moved.length) sections.push(...renderTiming(moved), '');
		if (timing.length) {
			sections.push(
				'<details>',
				`<summary>All ${timing.length} timed operations (${timing.length - moved.length} within noise)</summary>`,
				'',
				...renderTiming(timing),
				'',
				'</details>',
				'',
			);
		}
		if (timing.length && deterministic.length) sections.push('Deterministic counters:', '');
		if (deterministic.length || !timing.length) {
			sections.push(...renderDeterministic(deterministic, unchanged));
		}
	}
	const body =
		[
			COMMENT_MARKER,
			'## Benchmark report',
			'',
			flagged.length
				? flagged.map((item) => `- ${item}`).join('\n')
				: '🟢 No size increases and no timing regressions outside noise.',
			'',
			`Compares ${shortSha(baseSha, 'the base')} with ${shortSha(headSha, 'the merge commit')} on the same runner. ` +
				`Timing verdicts require a change beyond the combined margin of error (at least ${TIMING_FLOOR_PERCENT}%) and one ${TIMER_TICK_MS}ms timer tick, ` +
				`with the fastest sample moving the same way.${runUrl ? ` [Workflow run](${runUrl})` : ''}`,
			...sections,
		].join('\n') + '\n';
	return body.length > COMMENT_LIMIT
		? body.slice(0, COMMENT_LIMIT) +
				'\n\n_Truncated. The workflow run artifact has the full results._\n'
		: body;
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function mergeStat(stats) {
	if (stats.length === 1 || !stats.every(isTiming)) return stats[0];
	const score = mean(stats.map((stat) => stat.score));
	const spread =
		score === 0
			? 0
			: ((Math.max(...stats.map((stat) => stat.score)) -
					Math.min(...stats.map((stat) => stat.score))) /
					score) *
				100;
	return {
		score,
		median: mean(stats.map((stat) => stat.median)),
		min: Math.min(...stats.map((stat) => stat.min)),
		scoreRme: Math.max(spread, ...stats.map(rmeOf)),
		samples: stats.reduce((sum, stat) => sum + (Number(stat.samples) || 0), 0),
	};
}

export function mergeRounds(rounds) {
	const results = rounds.filter(Boolean);
	if (results.length <= 1) return results[0] ?? null;
	const failed = results.map((result) => failureOf(result)).filter(Boolean);
	const names = [
		...new Set(results.flatMap((result) => result.targets.map((target) => target.name))),
	];
	return {
		suite: results[0].suite,
		iterations: results[0].iterations,
		harnessExit: failed.length ? 1 : 0,
		...(failed.length ? { failed: failed.join(' | ') } : null),
		targets: names.map((name) => {
			const targets = results
				.map((result) => result.targets.find((target) => target.name === name))
				.filter(Boolean);
			const ops = [...new Set(targets.flatMap((target) => Object.keys(target.ops)))];
			return {
				name,
				ops: Object.fromEntries(
					ops.map((op) => [op, mergeStat(targets.map((target) => target.ops[op]).filter(Boolean))]),
				),
			};
		}),
	};
}

function readSuites(directories) {
	return Object.fromEntries(
		SUITES.map((suite) => [
			suite,
			mergeRounds(
				directories.split(',').map((directory) => {
					const file = path.join(directory, `${suite}.json`);
					return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
				}),
			),
		]),
	);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const options = Object.fromEntries(
		process.argv
			.slice(2)
			.filter((arg) => arg.startsWith('--') && arg.includes('='))
			.map((arg) => [arg.slice(2, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]),
	);
	if (!options.base || !options.head) {
		console.error(
			'usage: node benchmarks/pr-report.mjs --base=<dir>[,<dir>] --head=<dir>[,<dir>] [--out=<file>]',
		);
		process.exit(2);
	}
	const body = renderReport({
		base: readSuites(options.base),
		head: readSuites(options.head),
		baseSha: process.env.BASE_SHA,
		headSha: process.env.HEAD_SHA,
		runUrl: process.env.RUN_URL,
	});
	if (options.out) fs.writeFileSync(options.out, body);
	else process.stdout.write(body);
}
