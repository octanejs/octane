// Compact, checked-in home-page benchmark summary. Keep this separate from
// `benchmarks.ts`: that module imports every raw baseline used by the full
// /benchmarks page, while the home page only needs these normalized ratios.
// The website smoke test recomputes this snapshot from FRAMEWORK_CARDS so a
// changed baseline cannot silently leave the lighter home-page data stale.
import type { BenchCard, BenchRow, SeriesDef } from './benchmarks.ts';

const SUMMARY_SERIES: SeriesDef[] = [
	{ key: 'octane-tsrx', label: 'Octane (.tsrx)', color: '#ff415a' },
	{ key: 'react', label: 'React 19 + Compiler', color: '#1e93b0' },
	{ key: 'preact', label: 'Preact 10', color: '#7478fb' },
	{ key: 'solid', label: 'Solid 2.0 beta', color: '#1baf7a' },
	{ key: 'svelte', label: 'Svelte 5', color: '#f57547' },
	{ key: 'ripple', label: 'Ripple 0.3', color: '#9085e9' },
	{ key: 'vue-vapor', label: 'Vue Vapor 3.6 beta', color: '#e06ec4' },
];

export const HOME_SUMMARY: BenchCard = {
	id: 'home-summary',
	title: 'Every suite at a glance',
	description:
		'Geometric mean of each suite’s per-operation scores, relative to Octane. Lower is better.',
	series: SUMMARY_SERIES,
	rows: [
		{
			op: 'js-framework',
			'octane-tsrx': 1,
			react: 3.45866562365837,
			preact: 2.884617428538327,
			solid: 1.5610503672081835,
			svelte: 2.383871912234907,
			ripple: 1.545921927092224,
			'vue-vapor': 1.0382022254461298,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 2.9836829571221455,
			preact: 3.4608278231628122,
			solid: 1.5751738252365366,
			svelte: 1.9520918749011864,
			ripple: 0.9396158490697039,
			'vue-vapor': 1.0936058007544314,
		},
		{
			op: 'weather-app',
			'octane-tsrx': 1,
			react: 1.3398914841897458,
			preact: 1.4275522396184188,
			solid: 1.2239254846308867,
			svelte: 1.0706542974739615,
		},
		{
			op: 'weather-app-lighthouse',
			'octane-tsrx': 1,
			react: 1.0916784765725172,
			preact: 0.9259621305682169,
			solid: 0.9396253008680836,
			svelte: 0.9668668892528341,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 3.3223141888462706,
			preact: 2.084320795277768,
			solid: 0.9443224046803825,
			svelte: 1.7209050386699432,
			ripple: 0.9709368898143736,
			'vue-vapor': 0.9259363189973174,
		},
		{
			op: 'svg-dashboard',
			'octane-tsrx': 1,
			react: 1.1198413319934712,
			solid: 1.360086481545653,
			svelte: 1.0655543090924597,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 3.074590584205029,
			preact: 6.065314205679998,
			solid: 1.6208583758919253,
			svelte: 2.0861985530024785,
			ripple: 1.7076458154076004,
			'vue-vapor': 2.11220701618883,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.8162055938695885,
			preact: 1.9810753949596975,
			solid: 2.7130484257780023,
			svelte: 1.1716106025351771,
			ripple: 1.2301536964787054,
			'vue-vapor': 1.1043323417301805,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 0.8245516552354424,
			preact: 3.9086861921381066,
			solid: 0.856281373987506,
			svelte: 0.7485816175066573,
			ripple: 1.1171850305922213,
			'vue-vapor': 0.8098407186122014,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 3.705702883004493,
			preact: 16.635302772059543,
			solid: 0.9228807484306505,
			svelte: 3.2237339398782576,
			ripple: 6.105390914292663,
			'vue-vapor': 0.8869495987661731,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.570966249006335,
			preact: 1.201470939318563,
			solid: 1.2800568343195227,
			svelte: 1.6010489546357525,
			ripple: 0.8859363668374765,
			'vue-vapor': 0.9172544677779897,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 2.451182929587098,
			preact: 3.7865390194733393,
			solid: 0.5128843763871694,
			svelte: 0.604400751488173,
			ripple: 0.2877327736053317,
			'vue-vapor': 0.29727052304190404,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 1.9346161257150567,
			preact: 6.713984759769991,
			solid: 0.7730784670715877,
			svelte: 2.304713981196845,
			ripple: 2.650348595521743,
			'vue-vapor': 1.158139094936416,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 11.697992090327652,
			preact: 8.890724172866957,
			solid: 0.9219510065186661,
			svelte: 0.9273595177081646,
			ripple: 0.9041990874232222,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 2.4603588154336626,
			preact: 1.8690956294248111,
			solid: 1.8170538383944475,
			svelte: 0.9973928709310783,
			ripple: 1.7929132564237376,
			'vue-vapor': 1.1979444957877161,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 0.5199945194535573,
			preact: 0.7415985232571429,
			solid: 3.2222563100912174,
			ripple: 0.9061271962781192,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 3.0588206743947493,
			preact: 0.41344699363527543,
			solid: 0.7048978624320867,
			svelte: 0.9558883571257105,
			ripple: 0.7235888572722129,
			'vue-vapor': 1.317491239292139,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.9036191021971742,
			preact: 3.1299503163107625,
			solid: 2.057408740594159,
			svelte: 1.3011348126356272,
			ripple: 1.7620288024931063,
			'vue-vapor': 1.0979087748884615,
		},
	],
	iterations: 0,
	format: 'x',
};

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
	return Math.exp(ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0) / ratios.length);
}

export function createHomeSummary(cards: BenchCard[]): BenchCard {
	const rows: BenchRow[] = cards.map((card) => {
		const row: BenchRow = { op: card.id, 'octane-tsrx': 1 };
		for (const series of SUMMARY_SERIES) {
			if (series.key === 'octane-tsrx') continue;
			const geomean = geomeanVsOctane(card, series.key);
			if (geomean !== undefined) row[series.key] = geomean;
		}
		return row;
	});
	return { ...HOME_SUMMARY, rows };
}
