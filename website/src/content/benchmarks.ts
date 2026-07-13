// Benchmark data for the site's charts — the CHECKED-IN benchmark scores from
// `benchmarks/baselines/local/` (recorded by `node benchmarks/bench.mjs
// --record`, reproduced with `pnpm bench:all`), imported at build time so the
// site can never drift from the repo's numbers. This module massages the
// baseline shape ({ suite, targets: [{ name, ops }] }) into per-chart card
// descriptors: rows keyed by operation with one column per series, plus the
// series' fixed identity colors.
//
// Colors are validated for the site's dark panel surface (#2b3138) with the
// dataviz six-checks validator (lightness band, chroma floor, adjacent-pair
// CVD ΔE, contrast ≥3:1). Color follows the ENTITY: a framework keeps its hue
// on every chart on every page. Octane-internal variants (the de-opt suites)
// wear an ordinal ramp of the octane hue instead — light = naive/de-opted,
// brand red = the tuned fixture.
import dbmonDeopt from '../../../benchmarks/baselines/local/dbmon-deopt.json';
import dbmon from '../../../benchmarks/baselines/local/dbmon.json';
import asyncWaterfall from '../../../benchmarks/baselines/local/async-waterfall.json';
import bundleSize from '../../../benchmarks/baselines/local/bundle-size.json';
import chatStream from '../../../benchmarks/baselines/local/chat-stream.json';
import effectfulList from '../../../benchmarks/baselines/local/effectful-list.json';
import jsFrameworkDeopt from '../../../benchmarks/baselines/local/js-framework-deopt.json';
import jsFrameworkReorder from '../../../benchmarks/baselines/local/js-framework-reorder.json';
import jsFramework from '../../../benchmarks/baselines/local/js-framework.json';
import memoWall from '../../../benchmarks/baselines/local/memo-wall.json';
import news from '../../../benchmarks/baselines/local/news.json';
import portalSwarm from '../../../benchmarks/baselines/local/portal-swarm.json';
import recursiveContext from '../../../benchmarks/baselines/local/recursive-context.json';
import signalFavoring from '../../../benchmarks/baselines/local/signal-favoring.json';
import ssrThroughput from '../../../benchmarks/baselines/local/ssr-throughput.json';
import streamingSsr from '../../../benchmarks/baselines/local/streaming-ssr.json';
import todoMvc from '../../../benchmarks/baselines/local/todomvc.json';

// `score` is charted when present; older checked-in baselines fall back to
// `median`. Other stats vary by suite, so they stay optional.
interface OpStat {
	score?: number;
	median: number;
	min?: number;
	p95?: number;
	sd?: number;
	samples?: number;
}

interface SuiteBaseline {
	suite: string;
	iterations: number;
	targets: Array<{ name: string; ops: Record<string, OpStat> }>;
}

export interface SeriesDef {
	/** Target name in the baseline file (and row key in `rows`). */
	key: string;
	/** Legend / table label. */
	label: string;
	/** Validated series color on the site's dark panel surface. */
	color: string;
}

export interface BenchRow {
	op: string;
	[seriesKey: string]: string | number;
}

export interface BenchCard {
	id: string;
	title: string;
	description: string;
	/** Series present in this card, in display order. */
	series: SeriesDef[];
	rows: BenchRow[];
	iterations: number;
	/** Value unit: absolute score milliseconds (default), bytes, or ×-vs-Octane ratio. */
	format?: 'ms' | 'bytes' | 'x';
}

// ---------------------------------------------------------------------------
// Series identity — fixed hue per framework, everywhere.
// Validated set: #ff415a #c98500 #1e93b0 #7478fb #1baf7a #f57547 #9085e9
// #e06ec4 (dark, on #2b3138). Every color clears 3:1 contrast on the panel;
// the palette keeps at least ΔE 10 across protan/deutan/tritan simulations.
// Preact and Svelte wear accessible indigo/coral variants of their brand hues.
// Vue can't wear its brand green — it collapses into Solid's under tritan
// simulation — so it wears orchid.
// ---------------------------------------------------------------------------
// Versions are the pnpm-catalog pins the fixtures actually run.
const FRAMEWORKS: SeriesDef[] = [
	{ key: 'octane-tsrx', label: 'Octane (.tsrx)', color: '#ff415a' },
	{ key: 'octane-jsx', label: 'Octane (.tsx)', color: '#c98500' },
	{ key: 'react', label: 'React 19', color: '#1e93b0' },
	{ key: 'preact', label: 'Preact 10', color: '#7478fb' },
	{ key: 'solid', label: 'Solid 2.0 beta', color: '#1baf7a' },
	{ key: 'svelte', label: 'Svelte 5', color: '#f57547' },
	{ key: 'ripple', label: 'Ripple 0.3', color: '#9085e9' },
	{ key: 'vue-vapor', label: 'Vue Vapor 3.6 beta', color: '#e06ec4' },
];

// Octane-internal variants — ordinal ramp of the brand hue, validated with
// --ordinal (monotone lightness, visible step gaps, dark end clears surface).
const VARIANT_COLORS = {
	tuned: '#ff415a',
	lightest: '#ffaab7',
	light: '#ff7186',
	dark: '#c22b40',
} as const;

function seriesFor(baseline: SuiteBaseline, defs: SeriesDef[]): SeriesDef[] {
	const present = new Set(baseline.targets.map((t) => t.name));
	return defs.filter((d) => present.has(d.key));
}

function statValue(stat: OpStat): number {
	return stat.score ?? stat.median;
}

function rowsFor(
	baseline: SuiteBaseline,
	series: SeriesDef[],
	opLabels?: Record<string, string>,
	ops?: string[],
): BenchRow[] {
	const byName = new Map(baseline.targets.map((t) => [t.name, t]));
	const opKeys = ops ?? Object.keys(baseline.targets[0].ops);
	return opKeys.map((op) => {
		const row: BenchRow = { op: opLabels?.[op] ?? op };
		for (const s of series) {
			const stat = byName.get(s.key)?.ops[op];
			if (stat) row[s.key] = statValue(stat);
		}
		return row;
	});
}

function frameworkCard(
	baseline: unknown,
	id: string,
	title: string,
	description: string,
	opLabels?: Record<string, string>,
	ops?: string[],
	format?: BenchCard['format'],
): BenchCard {
	const b = baseline as SuiteBaseline;
	const series = seriesFor(b, FRAMEWORKS);
	return {
		id,
		title,
		description,
		series,
		rows: rowsFor(b, series, opLabels, ops),
		iterations: b.iterations,
		format,
	};
}

// ---------------------------------------------------------------------------
// Octane vs the field — one card per cross-framework suite.
// ---------------------------------------------------------------------------
export const FRAMEWORK_CARDS: BenchCard[] = [
	frameworkCard(
		jsFramework,
		'js-framework',
		'js-framework',
		'krausest-style table operations over 1,000 rows — create, replace, partial update, select, swap, remove, clear.',
	),
	frameworkCard(
		todoMvc,
		'todomvc',
		'todomvc',
		'TodoMVC workflows — add, complete, filter, edit, clear and destroy items, with native form/input events in the loop.',
		{
			add100: 'add 100',
			toggleAllOn: 'toggle all on',
			toggleAllOff: 'toggle all off',
			complete25: 'complete 25',
			filterCycle: 'filter cycle',
			edit10: 'edit 10',
			clearCompleted: 'clear completed',
			destroy25: 'destroy 25',
		},
		[
			'add100',
			'toggleAllOn',
			'toggleAllOff',
			'complete25',
			'filterCycle',
			'edit10',
			'clearCompleted',
			'destroy25',
		],
	),
	frameworkCard(
		chatStream,
		'chat-stream',
		'chat-stream',
		'Chat UI workloads — token streaming, coarse updates, history append, conversation switches and text input.',
		{
			streamFine: 'fine stream',
			streamCoarse: 'coarse stream',
			appendHistory: 'append history',
			switchConv: 'switch conversation',
			type160: 'type 160 chars',
		},
		['streamFine', 'streamCoarse', 'appendHistory', 'switchConv', 'type160'],
	),
	frameworkCard(
		jsFrameworkReorder,
		'js-framework-reorder',
		'js-framework-reorder',
		'The keyed-reorder matrix — reverse, shuffle, rotations, prepends and displacements — stressing the keyed reconciler. Ripple’s prepend and insert-mid cells are omitted because their current identity gates fail; invalid timings are never charted.',
	),
	frameworkCard(
		dbmon,
		'dbmon',
		'dbmon',
		'The DBMonster dashboard — high-frequency cell updates across a wall of database rows.',
	),
	frameworkCard(
		effectfulList,
		'effectful-list',
		'effectful-list',
		'A 1,000-item list where every row runs effects and refs — the subsystems a plain row bench never touches.',
	),
	frameworkCard(
		memoWall,
		'memo-wall',
		'memo-wall',
		'Memo bail-out walls — parent re-renders against memoized subtrees, and context updates punching through them. Solid, Svelte, Ripple and Vue Vapor have no parent re-render to absorb, so their near-zero wall ops are the fine-grained model’s honest number.',
	),
	frameworkCard(
		recursiveContext,
		'recursive-context',
		'recursive-context',
		'A deep recursive tree driven by context updates — mount, root and partial updates, unmount.',
	),
	frameworkCard(
		signalFavoring,
		'signal-favoring',
		'signal-favoring',
		'Deep-tree state bumps at increasing depths — the workload shape signal frameworks are built around.',
	),
	frameworkCard(
		portalSwarm,
		'portal-swarm',
		'portal-swarm',
		'Many portals mounting, opening, closing and re-rendering — dispatching through portal boundaries.',
	),
	frameworkCard(
		asyncWaterfall,
		'async-waterfall',
		'async-waterfall',
		'Ten nested async levels with 16ms simulated latency — Octane’s compiled parallel-use path versus React and Preact nested-use waterfalls and signal-first models.',
	),
	frameworkCard(
		news,
		'news',
		'news',
		'A news-site page: full SSR render and client hydration of the same app.',
		{
			ssr_render: 'SSR render',
			hydrate: 'hydrate',
		},
	),
	frameworkCard(
		streamingSsr,
		'streaming-ssr',
		'streaming-ssr',
		'Streaming SSR shell and completion times for staggered Suspense and all-fast renders. Preact participates with its public stream renderer; Svelte 5 is omitted because its public server renderer is buffered.',
		{
			shell_staggered: 'staggered shell',
			total_staggered: 'staggered complete',
			shell_allfast: 'all-fast shell',
			total_allfast: 'all-fast complete',
		},
		['shell_staggered', 'total_staggered', 'shell_allfast', 'total_allfast'],
	),
	frameworkCard(
		bundleSize,
		'bundle-size',
		'bundle-size',
		'Production shipped JavaScript bytes with normalized minification — total gzip and app-code gzip across the rows, TodoMVC and chat fixtures.',
		{
			js_gzip: 'rows total gzip',
			app_gzip: 'rows app gzip',
			todo_app_gzip: 'Todo app gzip',
			chat_app_gzip: 'chat app gzip',
		},
		['js_gzip', 'app_gzip', 'todo_app_gzip', 'chat_app_gzip'],
		'bytes',
	),
];

// ssr-throughput's cross-framework half: targets are named `scenario/framework`
// — regroup into rows per scenario with one column per framework.
{
	const b = ssrThroughput as SuiteBaseline;
	const scenarios = ['news-50', 'news-500'];
	const series = FRAMEWORKS.filter((f) =>
		b.targets.some((t) => t.name === `${scenarios[0]}/${f.key}`),
	);
	const rows: BenchRow[] = scenarios.map((scenario) => {
		const row: BenchRow = { op: scenario };
		for (const s of series) {
			const target = b.targets.find((t) => t.name === `${scenario}/${s.key}`);
			if (target) row[s.key] = statValue(target.ops.render);
		}
		return row;
	});
	FRAMEWORK_CARDS.push({
		id: 'ssr-throughput',
		title: 'ssr-throughput',
		description:
			'Server renders of the news page at 50 and 500 items — benchmark score ms per render.',
		series,
		rows,
		iterations: b.iterations,
	});
}

// ---------------------------------------------------------------------------
// The authoring cliff — octane-internal de-opt suites.
// ---------------------------------------------------------------------------
export const OCTANE_CARDS: BenchCard[] = [];

{
	const b = jsFrameworkDeopt as SuiteBaseline;
	const series: SeriesDef[] = [
		{ key: 'octane-tsrx', label: 'Tuned .tsrx', color: VARIANT_COLORS.tuned },
		{
			key: 'octane-tsrx-naive',
			label: 'Naive .tsrx (React-style)',
			color: VARIANT_COLORS.lightest,
		},
		{ key: 'octane-jsx-naive', label: 'Naive .tsx', color: VARIANT_COLORS.light },
		{ key: 'octane-ts', label: 'Plain .ts createElement', color: VARIANT_COLORS.dark },
	];
	OCTANE_CARDS.push({
		id: 'js-framework-deopt',
		title: 'js-framework — the authoring cliff',
		description:
			'The same 1,000-row app authored four ways: tuned .tsrx, React-style naive .tsrx and .tsx, and plain-.ts createElement with no compiler involvement (the shape every binding produces).',
		series,
		rows: rowsFor(b, series),
		iterations: b.iterations,
	});
}

{
	const b = dbmonDeopt as SuiteBaseline;
	const series: SeriesDef[] = [
		{ key: 'octane-tsrx', label: 'Compiled .tsrx', color: VARIANT_COLORS.tuned },
		{ key: 'octane-deopt', label: 'Plain .ts createElement', color: VARIANT_COLORS.lightest },
	];
	OCTANE_CARDS.push({
		id: 'dbmon-deopt',
		title: 'dbmon — de-opt path',
		description:
			'The exact dbmon workload in plain-.ts createElement (full descriptor reconciliation) against the compiled fixture.',
		series,
		rows: rowsFor(b, series),
		iterations: b.iterations,
	});
}

{
	const b = ssrThroughput as SuiteBaseline;
	const octaneOnly = [
		['waterfall-d1', 'waterfall depth 1'],
		['waterfall-d2', 'waterfall depth 2'],
		['waterfall-d4', 'waterfall depth 4'],
		['waterfall-d4-x32', 'depth 4 × 32 wide'],
		['escape-heavy', 'escape-heavy page'],
		['deopt-page/octane-fast', 'de-opt page (fast)'],
		['deopt-page/octane-deopt', 'de-opt page (de-opted)'],
	] as const;
	const series: SeriesDef[] = [{ key: 'octane', label: 'Octane SSR', color: VARIANT_COLORS.tuned }];
	const byName = new Map(b.targets.map((t) => [t.name, t]));
	const rows: BenchRow[] = octaneOnly
		.filter(([name]) => byName.has(name))
		.map(([name, label]) => ({ op: label, octane: statValue(byName.get(name)!.ops.render) }));
	OCTANE_CARDS.push({
		id: 'ssr-scenarios',
		title: 'SSR scenarios',
		description:
			'Octane-only SSR shapes — suspense waterfalls by depth, a 32-wide fan-out, an escape-heavy page, and the de-opt page pair. Benchmark score ms per render.',
		series,
		rows,
		iterations: b.iterations,
	});
}

// ---------------------------------------------------------------------------
// Home-page summary — EVERY cross-framework suite on one normalized scale:
// per suite and framework, the geometric mean of per-operation
// (framework score ÷ octane-tsrx score). Octane is the 1× reference bar.
// Ops without a measurement on either side — or with a sub-timer-resolution
// 0 score — are skipped for that pair (geomean over the valid ops).
// ---------------------------------------------------------------------------
const SUMMARY_SERIES = FRAMEWORKS.filter((f) =>
	['octane-tsrx', 'react', 'preact', 'solid', 'svelte', 'ripple', 'vue-vapor'].includes(f.key),
);

function geomeanVsOctane(card: BenchCard, key: string): number | undefined {
	const ratios: number[] = [];
	for (const row of card.rows) {
		const octane = row['octane-tsrx'];
		const value = row[key];
		if (typeof octane === 'number' && octane > 0 && typeof value === 'number' && value > 0) {
			ratios.push(value / octane);
		}
	}
	if (ratios.length === 0) return undefined;
	return Math.exp(ratios.reduce((sum, r) => sum + Math.log(r), 0) / ratios.length);
}

export const HOME_SUMMARY: BenchCard = (() => {
	const rows: BenchRow[] = FRAMEWORK_CARDS.map((card) => {
		const row: BenchRow = { op: card.id, 'octane-tsrx': 1 };
		for (const s of SUMMARY_SERIES) {
			if (s.key === 'octane-tsrx') continue;
			const gm = geomeanVsOctane(card, s.key);
			if (gm !== undefined) row[s.key] = gm;
		}
		return row;
	});
	return {
		id: 'home-summary',
		title: 'Every suite, normalized',
		description:
			'Geometric mean of per-operation benchmark scores, relative to Octane. Lower is better.',
		series: SUMMARY_SERIES,
		rows,
		iterations: 0,
		format: 'x',
	};
})();
