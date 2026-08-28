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
import lynxTableWeb from '../../../benchmarks/baselines/local/lynx-table-web.json';
import lynxTable from '../../../benchmarks/baselines/local/lynx-table.json';
import spaNavigation from '../../../benchmarks/baselines/local/spa-navigation.json';
import ssrThroughput from '../../../benchmarks/baselines/local/ssr-throughput.json';
import streamingSsr from '../../../benchmarks/baselines/local/streaming-ssr.json';
import svgDashboard from '../../../benchmarks/baselines/local/svg-dashboard.json';
import todoMvc from '../../../benchmarks/baselines/local/todomvc.json';
import uibench from '../../../benchmarks/baselines/local/uibench.json';
import asyncComposition from '../../../benchmarks/baselines/local/async-composition.json';
import ssrHttp from '../../../benchmarks/baselines/local/ssr-http.json';
import tanstackStart from '../../../benchmarks/baselines/local/tanstack-start.json';
import threeBundleSize from '../../../benchmarks/baselines/local/three-bundle-size.json';
import threeRenderer from '../../../benchmarks/baselines/local/three-renderer.json';
import weatherAppLighthouse from '../../../benchmarks/baselines/local/weather-app-lighthouse.json';
import weatherApp from '../../../benchmarks/baselines/local/weather-app.json';

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
	format?: 'ms' | 'bytes' | 'x' | 'count';
}

// ---------------------------------------------------------------------------
// Series identity — fixed hue per framework, everywhere.
// Validated set: #ff415a #c98500 #1e93b0 #4bafe7 #7478fb #1baf7a #f57547
// #9085e9 #e06ec4 #c8d1dc (dark, on #2b3138). Every color clears 3:1 contrast on the panel;
// the palette keeps at least ΔE 10 across protan/deutan/tritan simulations.
// Preact and Svelte wear accessible indigo/coral variants of their brand hues.
// Vue can't wear its brand green — it collapses into Solid's under tritan
// simulation — so it wears orchid.
// ---------------------------------------------------------------------------
// Versions are the pnpm-catalog pins the fixtures actually run.
const FRAMEWORKS: SeriesDef[] = [
	{ key: 'octane-tsrx', label: 'Octane (.tsrx)', color: '#ff415a' },
	{ key: 'octane-jsx', label: 'Octane (.tsx)', color: '#c98500' },
	{ key: 'react', label: 'React 19 + Compiler', color: '#1e93b0' },
	{ key: 'react-uncompiled', label: 'React 19 (uncompiled control)', color: '#4bafe7' },
	{ key: 'preact', label: 'Preact 10', color: '#7478fb' },
	{ key: 'solid', label: 'Solid 2.0 beta', color: '#1baf7a' },
	{ key: 'svelte', label: 'Svelte 5', color: '#f57547' },
	{ key: 'ripple', label: 'Ripple 0.3', color: '#9085e9' },
	{ key: 'vue-vapor', label: 'Vue Vapor 3.6 RC', color: '#e06ec4' },
	// The weather-app fixtures publish plain `vue` (same 3.6 pin). Color follows
	// the entity, and the two Vue keys never appear on the same card.
	{ key: 'vue', label: 'Vue 3.6', color: '#e06ec4' },
	// Inferno's brand red collapses into Octane's and Svelte's under CVD
	// simulation, so its field-comparison series wears a neutral blue-gray.
	{ key: 'inferno', label: 'Inferno 9', color: '#c8d1dc' },
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

const JS_FRAMEWORK_SHARED_OPS = [
	'run',
	'replace',
	'add',
	'update',
	'select',
	'swap',
	'remove',
	'runlots',
	'select_lots',
	'clear',
];

const UIBENCH_DIAGNOSTIC_OPS = new Set(['cases', 'elements_largest', 'identity_shared']);
const UIBENCH_TIMING_OPS = Object.keys((uibench as SuiteBaseline).targets[0].ops).filter(
	(op) => !UIBENCH_DIAGNOSTIC_OPS.has(op),
);

// ---------------------------------------------------------------------------
// Octane vs the field — one card per cross-framework suite.
// ---------------------------------------------------------------------------
export const FRAMEWORK_CARDS: BenchCard[] = [
	frameworkCard(
		jsFramework,
		'js-framework',
		'js-framework',
		'krausest-style table operations over 1,000 rows — create, replace, partial update, select, swap, remove, clear.',
		undefined,
		// Keep only shared timings; insertion/fragment diagnostics in Octane's
		// baseline are not measured by the reference frameworks.
		JS_FRAMEWORK_SHARED_OPS,
	),
	frameworkCard(
		uibench,
		'uibench',
		'UIbench',
		'UIbench’s 96-case desktop matrix — table mutations, animation updates, keyed tree reorders and published worst cases. Every target must match semantic signatures and survivor identity before its timings are accepted.',
		undefined,
		UIBENCH_TIMING_OPS,
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
		weatherApp,
		'weather-app',
		'weather-app',
		'A real weather dashboard — cold start to interactive, keyed forecast churn, and async city search with error and recovery flows. The DOM-census counters in the baseline are diagnostics and stay out of the chart.',
		{
			initial_ready: 'cold ready',
			forecast_cycle: 'forecast churn',
			search_city: 'search city',
			search_error: 'search error',
			search_recover: 'search recover',
		},
		['initial_ready', 'forecast_cycle', 'search_city', 'search_error', 'search_recover'],
	),
	frameworkCard(
		weatherAppLighthouse,
		'weather-app-lighthouse',
		'weather-app — Lighthouse',
		'Desktop Lighthouse lab metrics for the same weather app — simulated and observed first and largest contentful paint, speed index, and total blocking time. Simulated paints use Lighthouse’s desktop-network model; observed paints come from the unthrottled browser trace. Cumulative layout shift is unitless and omitted from the millisecond chart.',
		{
			first_contentful_paint: 'simulated FCP',
			observed_first_contentful_paint: 'observed FCP',
			largest_contentful_paint: 'simulated LCP',
			observed_largest_contentful_paint: 'observed LCP',
			speed_index: 'speed index',
			total_blocking_time: 'TBT',
		},
		[
			'first_contentful_paint',
			'observed_first_contentful_paint',
			'largest_contentful_paint',
			'observed_largest_contentful_paint',
			'speed_index',
			'total_blocking_time',
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
		svgDashboard,
		'svg-dashboard',
		'svg-dashboard',
		'A hand-rolled SVG observability dashboard — path and transform churn, keyed reconciliation inside SVG, foreignObject labels, portal tooltips, runtime icons, and style/spread updates.',
		{
			charts_tick: 'chart tick',
			tick_sparse: 'sparse tick',
			drag_nodes: 'drag nodes',
			pan_zoom: 'pan and zoom',
			select_toggle: 'toggle selection',
			topology_churn: 'topology churn',
			label_churn: 'label churn',
			tooltip_swarm: 'tooltip swarm',
			icon_swap: 'icon swap',
			series_toggle: 'series toggle',
			style_spread_pulse: 'style/spread pulse',
		},
		[
			'mount',
			'charts_tick',
			'tick_sparse',
			'drag_nodes',
			'pan_zoom',
			'select_toggle',
			'topology_churn',
			'label_churn',
			'tooltip_swarm',
			'icon_swap',
			'series_toggle',
			'style_spread_pulse',
		],
	),
	frameworkCard(
		jsFrameworkReorder,
		'js-framework-reorder',
		'js-framework-reorder',
		'The keyed-reorder matrix — reverse, shuffle, rotations, prepends and displacements — stressing the keyed reconciler. Semantic output and surviving row identity are gated before timings are accepted.',
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
		'Memo bail-out walls — parent re-renders against memoized subtrees, and context updates punching through them. The primary React entry uses React Compiler; an additional, explicitly uncompiled React control isolates the compiler’s effect. Solid, Svelte, Ripple and Vue Vapor have no parent re-render to absorb, so their near-zero wall ops are the fine-grained model’s honest number.',
	),
	frameworkCard(
		recursiveContext,
		'recursive-context',
		'recursive-context',
		'A deep recursive tree driven by context updates — mount, root and partial updates, unmount.',
	),
	frameworkCard(
		spaNavigation,
		'spa-navigation',
		'spa-navigation',
		'Full-page client navigation — routed-subtree teardown and mount while the app shell survives, including nested-layout reuse and a 6× CPU-throttled route swap.',
		{
			nav_deep: 'deep route swap',
			nav_teardown: 'deep → nested',
			nav_mount: 'nested → deep',
			nav_nested: 'nested route swap',
			nav_deep_6x: 'deep route swap (6× CPU)',
		},
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
		'Production shipped JavaScript bytes with normalized minification — total gzip across the rows, TodoMVC, chat and weather fixtures.',
		{
			js_gzip: 'rows total gzip',
			todo_js_gzip: 'TodoMVC total gzip',
			chat_js_gzip: 'chat total gzip',
			weather_js_gzip: 'weather total gzip',
		},
		['js_gzip', 'todo_js_gzip', 'chat_js_gzip', 'weather_js_gzip'],
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
// Head-to-head targets — suites whose roster is a specific stack rather than
// the whole field: octane against React on real HTTP servers, composed async
// trees and TanStack Start, plus the Three.js renderer column. These stay off
// the home summary, which aggregates only the full-roster cards above.
// ---------------------------------------------------------------------------
export const TARGET_CARDS: BenchCard[] = [
	frameworkCard(
		asyncComposition,
		'async-composition',
		'async-composition',
		'Composed async use() trees — Octane\u2019s compiled parallel-use batching against React\u2019s render-and-suspend loop. The wave, call and span counts in the baseline are deterministic diagnostics and stay out of the chart.',
		{ init: 'initial render', update: 'update' },
		['init', 'update'],
	),
	frameworkCard(
		ssrHttp,
		'ssr-http',
		'ssr-http',
		'Real production HTTP servers rendering the news page — renderer import, cold spawn/listen/first-byte, and streamed shell and completion times over HTTP for staggered and all-fast Suspense.',
		{
			import_renderer: 'import renderer',
			cold_spawn_to_listen: 'cold spawn\u2192listen',
			cold_listen_to_first_byte: 'cold listen\u2192first byte',
			cold_spawn_to_first_byte: 'cold spawn\u2192first byte',
			http_shell_staggered: 'staggered shell',
			http_total_staggered: 'staggered complete',
			http_shell_allfast: 'all-fast shell',
			http_total_allfast: 'all-fast complete',
		},
	),
];

{
	const b = tanstackStart as SuiteBaseline;
	const series: SeriesDef[] = [
		{ key: 'octane-minimal', label: 'Octane Start (minimal server)', color: VARIANT_COLORS.tuned },
		{ key: 'octane-nitro', label: 'Octane Start (nitro)', color: VARIANT_COLORS.dark },
		{ key: 'react', label: 'React (TanStack Start)', color: '#1e93b0' },
	];
	TARGET_CARDS.push({
		id: 'tanstack-start',
		title: 'tanstack-start',
		description:
			'The same TanStack Start app served by React and by the Octane port — cold start to first byte, warm TTFB and completion for the posts and deferred routes, the deferred stream tail, and sequential home requests.',
		series,
		rows: rowsFor(b, series, {
			cold_spawn_to_listen: 'cold spawn\u2192listen',
			cold_listen_to_first_byte: 'cold listen\u2192first byte',
			cold_spawn_to_first_byte: 'cold spawn\u2192first byte',
			warm_ttfb_posts: 'warm TTFB /posts',
			warm_total_posts: 'warm total /posts',
			warm_ttfb_deferred: 'warm TTFB /deferred',
			warm_total_deferred: 'warm total /deferred',
			warm_stream_tail_deferred: 'deferred stream tail',
			warm_seq_request_home: 'sequential home requests',
		}),
		iterations: b.iterations,
	});
}

// The imperative Three.js column is the no-framework control, so it wears the
// control blue (react-uncompiled\u2019s slot — the two never share a card).
const THREE_SERIES = {
	octane: { label: 'Octane Three', color: VARIANT_COLORS.tuned },
	r3f: { label: 'React Three Fiber 9', color: '#1e93b0' },
	plain: { label: 'Plain Three.js', color: '#4bafe7' },
} as const;

{
	const b = threeRenderer as SuiteBaseline;
	const series: SeriesDef[] = [
		{ key: 'octane', ...THREE_SERIES.octane },
		{ key: 'r3f-9.6.1', ...THREE_SERIES.r3f },
		{ key: 'plain-three', ...THREE_SERIES.plain },
	];
	TARGET_CARDS.push({
		id: 'three-renderer',
		title: 'three-renderer',
		description:
			'Object lifecycle at 1,000 meshes — mount, update, reorder, unmount, direct and component-driven reconstruction with disposal, a frame with 1,000 subscribers, and raycast events — for the Octane Three renderer, React Three Fiber, and hand-written Three.js.',
		series,
		rows: rowsFor(b, series, {
			mount_1k: 'mount 1k',
			update_1k: 'update 1k',
			reorder_1k: 'reorder 1k',
			unmount_tree_1k: 'unmount 1k',
			reconstruct_dispose_1k: 'reconstruct + dispose 1k',
			reconstruct_component_dispose_1k: 'reconstruct component + dispose 1k',
			frame_1k_subscribers: 'frame, 1k subscribers',
			raycast_event: 'raycast event',
		}),
		iterations: b.iterations,
	});
}

// three-bundle-size targets are named `<renderer>-<scene>` — regroup into one
// row per scene with one gzip-bytes column per renderer.
{
	const b = threeBundleSize as SuiteBaseline;
	const series: SeriesDef[] = [
		{ key: 'octane', ...THREE_SERIES.octane },
		{ key: 'r3f', ...THREE_SERIES.r3f },
		{ key: 'plain', ...THREE_SERIES.plain },
	];
	const byName = new Map(b.targets.map((t) => [t.name, t]));
	const rows: BenchRow[] = (
		[
			['min', 'minimal scene'],
			['full', 'full helpers'],
		] as const
	).map(([scene, label]) => {
		const row: BenchRow = { op: label };
		for (const s of series) {
			const target = byName.get(`${s.key}-${scene}`);
			if (target) row[s.key] = statValue(target.ops.js_gzip);
		}
		return row;
	});
	TARGET_CARDS.push({
		id: 'three-bundle-size',
		title: 'three-bundle-size',
		description:
			'Shipped gzip JavaScript for a minimal scene and a helpers-heavy scene across the three renderers.',
		series,
		rows,
		iterations: b.iterations,
		format: 'bytes',
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
		// The tuned fixture also emits deterministic diagnostics that the naive
		// fixtures do not. Keep this comparison to operations measured by all four.
		rows: rowsFor(b, series, undefined, JS_FRAMEWORK_SHARED_OPS),
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
// Octane on Lynx — the dual-thread renderer against the other Lynx frameworks.
// ---------------------------------------------------------------------------
export const LYNX_CARDS: BenchCard[] = [];

{
	// Cross-framework wall clock on Lynx for Web: the same krausest table app
	// per framework, served into a <lynx-view> (@lynx-js/web-core + headless
	// Chromium) and driven by one byte-identical page driver — real clicks,
	// shadow-piercing DOM predicates, fresh page per rep. Recorded medians from
	// `bench.mjs --record --only lynx-table-web`; absolute ms are host-bound,
	// the cross-framework ratios are the portable reading.
	const b = lynxTableWeb as SuiteBaseline;
	const series: SeriesDef[] = [
		{ key: 'octane', label: 'Octane on Lynx', color: '#ff415a' },
		{ key: 'react', label: 'ReactLynx 0.122', color: '#1e93b0' },
		// Vue Lynx ships two renderers, so the vue entity wears an ordinal ramp
		// of its orchid (the octane-variant precedent): brand orchid = vapor,
		// light orchid = vdom. The lightness step keeps the pair separable under
		// CVD, and both clear 3:1 on the panel surface.
		{ key: 'vue-vdom', label: 'Vue Lynx vdom 3.6 beta', color: '#f0a3dc' },
		{ key: 'vue-vapor', label: 'Vue Lynx vapor 3.6 beta', color: '#e06ec4' },
	];
	LYNX_CARDS.push({
		id: 'lynx-table-web',
		title: 'lynx-table — Lynx for Web wall clock',
		description:
			'The cross-framework table on the Lynx-for-Web host at 10,000 rows — Octane, ReactLynx, and both Vue Lynx renderers driven by the byte-identical page driver, medians over fresh-page reps. Host-bound milliseconds; the ratios are the portable claim.',
		series: seriesFor(b, series),
		rows: rowsFor(
			b,
			seriesFor(b, series),
			{
				create_10k: 'create 10k rows',
				update10th_10k: 'update every 10th',
				select_10k: 'select one row',
				updateStorm_10k: 'update storm ×50',
				selectStorm_10k: 'select storm ×30',
			},
			['create_10k', 'update10th_10k', 'select_10k', 'updateStorm_10k', 'selectStorm_10k'],
		),
		iterations: b.iterations,
	});
}

{
	// Lynx dual-thread wire cost — deterministic command counts from the
	// `__OCTANE_LYNX_PROFILE__` counters, charted against the changed-rows
	// semantic floor (the commands a change of that size strictly implies).
	// Counts are exact and machine-independent. Today the bars are far apart:
	// the commit wire cost scales with the tree, not the change — the KNOWN
	// GAP the lynx-table ratio guards pin. As fixes land and tighten those
	// guards, the two bars converge; this card is the public face of that.
	const b = lynxTable as SuiteBaseline;
	const series: SeriesDef[] = [
		{ key: 'octane-lynx', label: 'Octane on Lynx', color: VARIANT_COLORS.tuned },
		{ key: 'changed-rows-model', label: 'Changed-rows floor', color: VARIANT_COLORS.lightest },
	];
	LYNX_CARDS.push({
		id: 'lynx-table-wire',
		title: 'lynx-table — commit wire cost',
		description:
			'Host commands per operation crossing the background→main thread wire for the 10,000-row cross-framework table, against the changed-rows floor: the commands a change of that size strictly implies. The gap between the two bars is the tracked, CI-guarded optimization target.',
		series,
		rows: rowsFor(
			b,
			series,
			{
				create_commands_10k: 'create 10k rows',
				update10th_commands_10k: 'update every 10th',
				select_commands_10k: 'select one row',
				update_storm_commands_10k: 'update storm ×50',
				select_storm_commands_10k: 'select storm ×30',
			},
			[
				'create_commands_10k',
				'update10th_commands_10k',
				'select_commands_10k',
				'update_storm_commands_10k',
				'select_storm_commands_10k',
			],
		),
		iterations: b.iterations,
		format: 'count',
	});
}

// The home page consumes a compact checked-in snapshot rather than pulling
// every raw baseline into its client chunk. Its smoke test recomputes the
// snapshot from FRAMEWORK_CARDS and catches drift.
export { HOME_SUMMARY } from './home-benchmark.ts';
