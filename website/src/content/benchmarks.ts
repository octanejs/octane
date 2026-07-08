// Benchmark data for the site's charts — the CHECKED-IN medians from
// `benchmarks/baselines/local/` (recorded by `node benchmarks/bench.mjs
// --record`, reproduced with `pnpm bench`), imported at build time so the site
// can never drift from the repo's numbers. This module massages the baseline
// shape ({ suite, targets: [{ name, ops }] }) into per-chart card descriptors:
// rows keyed by operation with one column per series, plus the series' fixed
// identity colors.
//
// Colors are validated for the site's dark panel surface (#2b3138) with the
// dataviz six-checks validator (lightness band, chroma floor, adjacent-pair
// CVD ΔE, contrast ≥3:1). Color follows the ENTITY: a framework keeps its hue
// on every chart on every page. Octane-internal variants (the de-opt suites)
// wear an ordinal ramp of the octane hue instead — light = naive/de-opted,
// brand red = the tuned fixture.
import dbmonDeopt from '../../../benchmarks/baselines/local/dbmon-deopt.json';
import dbmon from '../../../benchmarks/baselines/local/dbmon.json';
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

// Only `median` is charted; the other stats vary by suite (some harnesses
// don't record p95/sd), so they stay optional.
interface OpStat {
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
}

// ---------------------------------------------------------------------------
// Series identity — fixed hue per framework, everywhere.
// Validated set: #ff415a #c98500 #1e93b0 #1baf7a #9085e9 (dark, on #2b3138).
// ---------------------------------------------------------------------------
const FRAMEWORKS: SeriesDef[] = [
	{ key: 'octane-tsrx', label: 'Octane (.tsrx)', color: '#ff415a' },
	{ key: 'octane-jsx', label: 'Octane (.tsx)', color: '#c98500' },
	{ key: 'react', label: 'React 19', color: '#1e93b0' },
	{ key: 'solid', label: 'Solid', color: '#1baf7a' },
	{ key: 'ripple', label: 'Ripple', color: '#9085e9' },
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
			if (stat) row[s.key] = stat.median;
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
): BenchCard {
	const b = baseline as SuiteBaseline;
	const series = seriesFor(b, FRAMEWORKS);
	return {
		id,
		title,
		description,
		series,
		rows: rowsFor(b, series, opLabels),
		iterations: b.iterations,
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
		jsFrameworkReorder,
		'js-framework-reorder',
		'js-framework-reorder',
		'The keyed-reorder matrix — reverse, shuffle, rotations, prepends and displacements — stressing the keyed reconciler.',
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
		'Memo bail-out walls — parent re-renders against memoized subtrees, and context updates punching through them.',
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
		news,
		'news',
		'news',
		'A news-site page: full SSR render and client hydration of the same app.',
		{
			ssr_render: 'SSR render',
			hydrate: 'hydrate',
		},
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
			if (target) row[s.key] = target.ops.render.median;
		}
		return row;
	});
	FRAMEWORK_CARDS.push({
		id: 'ssr-throughput',
		title: 'ssr-throughput',
		description: 'Server renders of the news page at 50 and 500 items — median ms per render.',
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
		.map(([name, label]) => ({ op: label, octane: byName.get(name)!.ops.render.median }));
	OCTANE_CARDS.push({
		id: 'ssr-scenarios',
		title: 'SSR scenarios',
		description:
			'Octane-only SSR shapes — suspense waterfalls by depth, a 32-wide fan-out, an escape-heavy page, and the de-opt page pair. Median ms per render.',
		series,
		rows,
		iterations: b.iterations,
	});
}

// ---------------------------------------------------------------------------
// Home-page teaser — two curated suites, octane vs react, friendly op names.
// ---------------------------------------------------------------------------
function pick(card: BenchCard, keys: string[], opLabels: Record<string, string>): BenchCard {
	const series = card.series.filter((s) => keys.includes(s.key));
	const rows = Object.keys(opLabels).map((op) => {
		const source = card.rows.find((r) => r.op === op)!;
		const row: BenchRow = { op: opLabels[op] };
		for (const s of series) row[s.key] = source[s.key];
		return row;
	});
	return { ...card, series, rows };
}

export const HOME_CARDS: BenchCard[] = [
	{
		...pick(FRAMEWORK_CARDS.find((c) => c.id === 'js-framework')!, ['octane-tsrx', 'react'], {
			run: 'create 1,000 rows',
			replace: 'replace all rows',
			update: 'partial update',
			select: 'select row',
			swap: 'swap rows',
			clear: 'clear rows',
		}),
		id: 'home-js-framework',
		title: 'js-framework (1,000 rows)',
	},
	{
		...pick(FRAMEWORK_CARDS.find((c) => c.id === 'dbmon')!, ['octane-tsrx', 'react'], {
			mount: 'mount',
			tick: 'tick (all rows)',
			tick_partial: 'partial tick',
			sort: 'sort',
			remount: 'remount',
		}),
		id: 'home-dbmon',
		title: 'dbmon (databases dashboard)',
	},
];
