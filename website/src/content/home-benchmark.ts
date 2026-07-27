// Compact, checked-in home-page benchmark summary. Keep this separate from
// `benchmarks.ts`: that module imports every raw baseline used by the full
// /benchmarks page, while the home page only needs these normalized ratios.
// The website smoke test recomputes this snapshot from FRAMEWORK_CARDS so a
// changed baseline cannot silently leave the lighter home-page data stale.
import type { BenchCard, BenchRow, SeriesDef } from './benchmarks.ts';

const SUMMARY_SERIES: SeriesDef[] = [
	{ key: 'octane-tsrx', label: 'Octane (.tsrx)', color: '#ff415a' },
	{ key: 'react', label: 'React 19', color: '#1e93b0' },
	{ key: 'preact', label: 'Preact 10', color: '#7478fb' },
	{ key: 'solid', label: 'Solid 2.0 beta', color: '#1baf7a' },
	{ key: 'svelte', label: 'Svelte 5', color: '#f57547' },
	{ key: 'ripple', label: 'Ripple 0.3', color: '#9085e9' },
	{ key: 'vue-vapor', label: 'Vue Vapor 3.6 beta', color: '#e06ec4' },
];

export const HOME_SUMMARY: BenchCard = {
	id: 'home-summary',
	title: 'Every suite, normalized',
	description:
		'Geometric mean of per-operation benchmark scores, relative to Octane. Lower is better.',
	series: SUMMARY_SERIES,
	rows: [
		{
			op: 'js-framework',
			'octane-tsrx': 1,
			react: 2.5011467243758045,
			preact: 2.2645360563469574,
			solid: 1.0638620122531521,
			svelte: 1.6006272351697979,
			ripple: 1.0616827214378433,
			'vue-vapor': 0.9849736426688198,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 2.2771142306167644,
			preact: 2.5289992526325706,
			solid: 1.223165284614723,
			svelte: 1.0795149484590478,
			ripple: 0.7189278799856846,
			'vue-vapor': 0.8731823900778859,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 3.6556140795651366,
			preact: 4.048246518839522,
			solid: 1.3119453430343366,
			svelte: 1.867762755167599,
			ripple: 1.0165759381096762,
			'vue-vapor': 0.9022723475609553,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 3.181172565233184,
			preact: 6.383913001622661,
			solid: 1.5325472133320106,
			svelte: 2.249313398950559,
			ripple: 1.7044885584619691,
			'vue-vapor': 2.1191416731191937,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.8822776933023613,
			preact: 2.393602842132118,
			solid: 2.7301445071496664,
			svelte: 1.271325642824085,
			ripple: 1.2042241627105026,
			'vue-vapor': 1.0987740826225836,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 2.244303872003768,
			preact: 5.169926711919962,
			solid: 0.7237484710428695,
			svelte: 0.8737793482177563,
			ripple: 1.0603028133337742,
			'vue-vapor': 0.7510045039228647,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 5.390247706196227,
			preact: 6.475774851662553,
			solid: 0.316412380388186,
			svelte: 1.0711787166564686,
			ripple: 2.685155881442434,
			'vue-vapor': 0.30049857911139494,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.1018429019810994,
			preact: 1.2888620876669932,
			solid: 2.443954545233959,
			svelte: 4.95895966256013,
			ripple: 0.9317966550451221,
			'vue-vapor': 1.5310684482595158,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 3.4351208220748704,
			preact: 2.9277288294462025,
			solid: 0.5682518933879004,
			svelte: 0.7846749159761892,
			ripple: 0.3933685713747594,
			'vue-vapor': 0.3240429761314316,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 2.6345384087565744,
			preact: 2.9212365593032366,
			solid: 0.4512400392440764,
			svelte: 2.544428225389751,
			ripple: 1.5436200245548042,
			'vue-vapor': 1.271864317288355,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 11.72785964272244,
			preact: 8.903330580196002,
			solid: 0.9216994447732354,
			svelte: 0.9261778621261656,
			ripple: 0.8990052604014841,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 3.001682287282443,
			preact: 2.2042786896308417,
			solid: 1.9797339939551746,
			svelte: 1.0139313993958818,
			ripple: 1.170649416448525,
			'vue-vapor': 1.2522697272201115,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 1.0186576677882122,
			preact: 0.9193786808401916,
			solid: 3.362001233435026,
			ripple: 0.9103018582097617,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 0.9705531342513837,
			preact: 0.5882627315070047,
			solid: 0.7076511919803139,
			svelte: 0.8333354951056069,
			ripple: 0.7983489066750458,
			'vue-vapor': 0.6862283119088365,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.3895904525867695,
			preact: 2.2449971639175845,
			solid: 1.58098467691258,
			svelte: 0.9764859414456792,
			ripple: 0.8907041611228392,
			'vue-vapor': 0.8691918515815487,
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
