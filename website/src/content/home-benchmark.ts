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
			react: 3.9438617204235626,
			preact: 3.3199226170514913,
			solid: 1.6978299161993224,
			svelte: 2.537928224321009,
			ripple: 1.7180668553602878,
			'vue-vapor': 1.040236793877354,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 3.1699085466717385,
			preact: 2.98138788492699,
			solid: 1.568171616853279,
			svelte: 1.4137384268030346,
			ripple: 0.8962773294877027,
			'vue-vapor': 1.1252035280513875,
		},
		{
			op: 'weather-app',
			'octane-tsrx': 1,
			react: 1.2865838122262323,
			preact: 1.3554532651119484,
			solid: 1.2483553773559997,
			svelte: 0.9760650718946594,
		},
		{
			op: 'weather-app-lighthouse',
			'octane-tsrx': 1,
			react: 1.1358929801733304,
			preact: 0.9428640046990232,
			solid: 0.9653347043042514,
			svelte: 0.9834711215010148,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 3.1468299326648905,
			preact: 2.3237526547974245,
			solid: 1.3653934270766368,
			svelte: 2.0874829131005344,
			ripple: 1.1209880654054314,
			'vue-vapor': 1.0555835982847441,
		},
		{
			op: 'svg-dashboard',
			'octane-tsrx': 1,
			react: 1.168028547755451,
			solid: 1.3997258795169807,
			svelte: 1.1187728726635489,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.9503883888886397,
			preact: 6.090112162848513,
			solid: 1.5932392331264724,
			svelte: 2.3283058874252704,
			ripple: 1.644947052617768,
			'vue-vapor': 2.292533967635338,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.775281395751772,
			preact: 1.9281779128144707,
			solid: 2.727790839023399,
			svelte: 1.2238429799688841,
			ripple: 1.1868924204163454,
			'vue-vapor': 1.0807547050434108,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 0.717219390928708,
			preact: 3.654419536769205,
			solid: 0.5814480427846735,
			svelte: 0.7388318095138399,
			ripple: 1.0169007465422455,
			'vue-vapor': 0.7918635831741228,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 3.4219083525546985,
			preact: 14.86925534301633,
			solid: 0.8704387746452611,
			svelte: 2.7050505360970036,
			ripple: 5.5074356890466305,
			'vue-vapor': 0.7934121434115202,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.2906023389351395,
			preact: 1.1256482781977024,
			solid: 1.1001930427804276,
			svelte: 1.8573364621026967,
			ripple: 0.9446681086822123,
			'vue-vapor': 0.8760606467981672,
		},
		{
			op: 'spa-navigation',
			'octane-tsrx': 1,
			react: 1.0889333436387847,
			solid: 2.7825020131922766,
			'vue-vapor': 1.6959218066529334,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 8.944936688074106,
			preact: 8.750712215766503,
			solid: 1.6880919333644548,
			svelte: 2.07841290744466,
			ripple: 0.7560780191095622,
			'vue-vapor': 1.055190289328098,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 2.0452591538251346,
			preact: 6.353152973909923,
			solid: 1.0449328717546635,
			svelte: 2.4688047080992965,
			ripple: 2.795910523361341,
			'vue-vapor': 1.3152981344348884,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 11.326692291830845,
			preact: 8.572887134082238,
			solid: 0.8950800099777961,
			svelte: 0.8957074665020774,
			ripple: 0.878595940103132,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 2.985172700741307,
			preact: 1.900273147044469,
			solid: 1.9376853376824201,
			svelte: 1.1470009850309073,
			ripple: 1.6395054091558001,
			'vue-vapor': 1.1558462502366416,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 0.9455393781048219,
			preact: 1.1063136729496277,
			solid: 3.6692202506725717,
			ripple: 0.9940288194639262,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 2.6808268963609154,
			preact: 0.3621079650955203,
			solid: 0.6182249243453706,
			svelte: 0.8374265644200258,
			ripple: 0.6296380098582017,
			'vue-vapor': 1.1464681826300622,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.4289960148408714,
			preact: 2.2292775969796472,
			solid: 1.5745494101663993,
			svelte: 0.9903843339722921,
			ripple: 1.4056444342650996,
			'vue-vapor': 0.860783183770355,
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
