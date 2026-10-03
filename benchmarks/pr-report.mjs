// Pull request benchmark report: compares BENCH_JSON suite results collected
// from a pull request's base and its merge commit on the same runner, renders
// the Markdown posted as the pull request's sticky comment, and exits non-zero
// when a gate fails.
//
// Run: node benchmarks/pr-report.mjs --base=<dir> --head=<dir> [--out=<file>]
//
// The base is the merge commit's first parent: the main commit the pull request
// would land on, so every delta is this pull request's own. CI passes the
// pull request's recorded base and how far main has moved past it in
// EVENT_BASE_SHA and BASE_DRIFT, for the header only.
//
// Gates (exit 1):
// - A byte value above its committed budget. Bundle suites publish each
//   committed budget as a same-run `<target>-budget` peer.
// - Any increase in a js-framework work counter: production calls, DOM
//   mutations, and live insertions per operation. These are exact for a fixed
//   build, so an increase is real extra work and needs a justification.
// - A suite that failed on the pull request.
//
// Reports only:
// - Byte changes within budget, which are listed exactly.
// - Wall time. js-framework pairs base and head samples in one browser
//   (js-framework/pair.mjs); an operation is called slower or faster only when
//   the 95% confidence interval of its head/base ratio lies entirely beyond ±3%.
//
// The comment workflow loads this file alone from the default branch, so it
// imports nothing outside Node's standard library.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMMENT_MARKER = '<!-- octane-pr-bench -->';
export const SUITES = ['js-framework', 'bundle-size', 'bundle-reachability'];
export const TIMING_THRESHOLD = 0.03;
// Chromium clamps performance.now() to 0.1ms. A verdict also needs the median
// shift to span two ticks of the whole sample, so an operation that cannot loop
// (a ~3ms create) cannot be called slower on one tick of quantization.
const TIMER_TICK_MS = 0.1;
const MIN_TICKS = 2;
const DETAIL_LIMIT = 2000;
const COMMENT_LIMIT = 60_000; // GitHub rejects comment bodies over 65,536 characters

const SUITE_INFO = {
	'js-framework': {
		title: 'js-framework: 1k/10k row operations',
		reports: (name) => name.startsWith('octane-'),
		workGate: true,
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

export function timingVerdict(paired, sampleMs) {
	if (!paired) return 'unpaired';
	const resolvable =
		typeof sampleMs !== 'number' ||
		Math.abs(paired.ratio - 1) * sampleMs >= MIN_TICKS * TIMER_TICK_MS;
	if (resolvable && paired.low > 1 + TIMING_THRESHOLD) return 'slower';
	if (resolvable && paired.high < 1 - TIMING_THRESHOLD) return 'faster';
	return 'within noise';
}

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
			if (isTiming(headStat) || isTiming(baseStat)) {
				const paired = headStat.paired ?? null;
				timing.push({ ...row, paired, verdict: timingVerdict(paired, headStat.sampleMs) });
			} else if (after !== before) {
				deterministic.push({ ...row, verdict: after > before ? 'larger' : 'smaller' });
			} else {
				unchanged++;
			}
		}
	}
	return { deterministic, timing, unchanged };
}

// Every head value above the same-run budget peer of its own target.
export function findBudgetBreaches(result) {
	const targets = new Map((result?.targets ?? []).map((target) => [target.name, target]));
	const breaches = [];
	for (const target of result?.targets ?? []) {
		const budget = targets.get(`${target.name}-budget`);
		if (!budget) continue;
		for (const [op, limitStat] of Object.entries(budget.ops)) {
			const value = valueOf(target.ops[op]);
			const limit = valueOf(limitStat);
			if (typeof value === 'number' && typeof limit === 'number' && value > limit) {
				breaches.push({ target: target.name, op, value, limit });
			}
		}
	}
	return breaches;
}

const formatInteger = (value) => Math.round(value).toLocaleString('en-US');
const formatSigned = (value, format) =>
	(value > 0 ? '+' : value < 0 ? '−' : '±') + format(Math.abs(value));
const formatPercent = (percent) => formatSigned(percent, (value) => `${value.toFixed(1)}%`);
const formatRatio = (ratio) => formatPercent((ratio - 1) * 100);
const ICON = {
	slower: '🟡',
	larger: '🔴',
	faster: '🟢',
	smaller: '🟢',
	'within noise': '⚪',
	unpaired: '⚪',
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

function renderBreaches(breaches) {
	return [
		'| target | metric | head | budget | over |',
		'| --- | --- | ---: | ---: | ---: |',
		...breaches.map(
			(row) =>
				`| ${row.target} | ${row.op} | ${formatInteger(row.value)} | ${formatInteger(row.limit)} | ` +
				`+${formatInteger(row.value - row.limit)} |`,
		),
	];
}

function renderTiming(rows) {
	return [
		'| target | operation | base ms | head ms | head/base | 95% CI | |',
		'| --- | --- | ---: | ---: | ---: | ---: | --- |',
		...rows.map(
			(row) =>
				`| ${row.target} | ${row.op} | ${row.before.toFixed(3)} | ${row.after.toFixed(3)} | ` +
				(row.paired
					? `${formatRatio(row.paired.ratio)} | ${formatRatio(row.paired.low)} … ${formatRatio(row.paired.high)} | `
					: `${formatPercent(row.percent)} | – | `) +
				`${ICON[row.verdict]} ${row.verdict} |`,
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

function describeBase({ baseSha, eventBaseSha, drift }) {
	const base = `${shortSha(baseSha, 'the base')}, the merge commit's first parent`;
	if (!eventBaseSha || eventBaseSha === baseSha) return base;
	const moved = Number(drift) > 0 ? ` ${drift} commit(s)` : '';
	return `${base} (main has moved${moved} past the pull request's recorded base ${shortSha(eventBaseSha)})`;
}

// Returns the Markdown report and the gate failures it contains.
export function analyzeReport({
	suites = SUITES,
	base,
	head,
	baseSha,
	headSha,
	eventBaseSha,
	drift,
	runUrl,
}) {
	const failures = [];
	const notes = [];
	const sections = [];
	for (const suite of suites) {
		sections.push('', `### ${SUITE_INFO[suite]?.title ?? suite}`, '');
		const headFailure = failureOf(head[suite]);
		const baseFailure = failureOf(base[suite]);
		if (headFailure) {
			failures.push(`❌ ${suite} failed on this pull request`);
			sections.push('❌ The suite failed on this pull request.', '', ...fenced(headFailure));
			continue;
		}
		const breaches = findBudgetBreaches(head[suite]);
		if (breaches.length) {
			failures.push(`❌ ${suite}: ${breaches.length} value(s) exceed their committed budget`);
			sections.push(
				`❌ ${breaches.length} value(s) exceed their committed budget. Reduce the growth, or raise ` +
					'the budget in a separate pull request that names the bytes and the reason ' +
					'(CONTRIBUTING.md, "Size budgets").',
				'',
				...renderBreaches(breaches),
				'',
			);
		}
		if (baseFailure) {
			notes.push(`⚠️ ${suite} failed on the base commit and was not compared`);
			sections.push(
				'⚠️ The suite failed on the base commit, so there is nothing to compare.',
				'',
				...fenced(baseFailure),
			);
			continue;
		}
		const { deterministic, timing, unchanged } = compareSuite(suite, base[suite], head[suite]);
		// A value over its budget is already a failure above, not growth within budget.
		const breached = new Set(breaches.map(({ target, op }) => `${target}\0${op}`));
		const larger = deterministic.filter(
			(row) => row.verdict === 'larger' && !breached.has(`${row.target}\0${row.op}`),
		);
		if (SUITE_INFO[suite]?.workGate && larger.length) {
			failures.push(`❌ ${suite}: ${larger.length} work counter(s) increased`);
		} else if (larger.length) {
			notes.push(`🔴 ${suite}: ${larger.length} value(s) increased within budget`);
		}
		const slower = timing.filter((row) => row.verdict === 'slower').length;
		if (slower) notes.push(`🟡 ${suite}: ${slower} timed operation(s) slower beyond ±3%`);
		const moved = timing.filter((row) => row.verdict === 'slower' || row.verdict === 'faster');
		if (moved.length) sections.push(...renderTiming(moved), '');
		if (timing.length) {
			sections.push(
				'<details>',
				`<summary>All ${timing.length} timed operations (${timing.length - moved.length} without a verdict)</summary>`,
				'',
				...renderTiming(timing),
				'',
				'</details>',
				'',
			);
		}
		if (timing.length && deterministic.length) {
			sections.push(
				SUITE_INFO[suite]?.workGate
					? 'Work counters (an increase fails this check):'
					: 'Deterministic counters:',
				'',
			);
		}
		if (deterministic.length || !timing.length) {
			sections.push(...renderDeterministic(deterministic, unchanged));
		} else if (SUITE_INFO[suite]?.workGate && unchanged) {
			sections.push(`All ${unchanged} work counters are unchanged.`);
		}
	}
	const headline = [...failures, ...notes];
	const body =
		[
			COMMENT_MARKER,
			'## Benchmark report',
			'',
			headline.length
				? headline.map((item) => `- ${item}`).join('\n')
				: '🟢 No budget breaches, no added work, and no timing changes beyond ±3%.',
			'',
			`Compares ${describeBase({ baseSha, eventBaseSha, drift })} with ` +
				`${shortSha(headSha, 'the merge commit')} on the same runner. ` +
				'A byte value over its committed budget or any increase in a js-framework work counter fails this check. ' +
				'Wall time is a report: base and head samples alternate in one browser, and an operation is called ' +
				`slower or faster only when the 95% confidence interval of its ratio excludes ±${TIMING_THRESHOLD * 100}%.` +
				(runUrl ? ` [Workflow run](${runUrl})` : ''),
			...sections,
		].join('\n') + '\n';
	return {
		body:
			body.length > COMMENT_LIMIT
				? body.slice(0, COMMENT_LIMIT) +
					'\n\n_Truncated. The workflow run artifact has the full results._\n'
				: body,
		failures,
	};
}

export const renderReport = (options) => analyzeReport(options).body;

function readSuites(directory) {
	return Object.fromEntries(
		SUITES.map((suite) => {
			const file = path.join(directory, `${suite}.json`);
			return [suite, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null];
		}),
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
		console.error('usage: node benchmarks/pr-report.mjs --base=<dir> --head=<dir> [--out=<file>]');
		process.exit(2);
	}
	const { body, failures } = analyzeReport({
		base: readSuites(options.base),
		head: readSuites(options.head),
		baseSha: process.env.BASE_SHA,
		headSha: process.env.HEAD_SHA,
		eventBaseSha: process.env.EVENT_BASE_SHA,
		drift: process.env.BASE_DRIFT,
		runUrl: process.env.RUN_URL,
	});
	if (options.out) fs.writeFileSync(options.out, body);
	else process.stdout.write(body);
	if (failures.length) {
		console.error(failures.join('\n'));
		process.exitCode = 1;
	}
}
