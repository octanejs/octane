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
	{ key: 'ripple', label: 'Ripple 0.4', color: '#9085e9' },
	{ key: 'vue-vapor', label: 'Vue Vapor 3.6 RC', color: '#e06ec4' },
	{ key: 'inferno', label: 'Inferno 9', color: '#c8d1dc' },
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
			react: 3.1572355260662843,
			preact: 2.6237215450684133,
			solid: 1.4005528444323692,
			svelte: 1.6852315468189722,
			ripple: 1.0602944036479593,
			'vue-vapor': 1.0898099578731648,
			inferno: 1.0535837060143884,
		},
		{
			op: 'uibench',
			'octane-tsrx': 1,
			react: 2.571693848896671,
			preact: 6.509567549102578,
			solid: 15.752555728640289,
			ripple: 0.9567889647732939,
			'vue-vapor': 1.5534763922533477,
			inferno: 2.565086726557554,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 2.5872575495993253,
			preact: 1.7891261010022117,
			solid: 1.2862383348319,
			svelte: 0.8131017242786059,
			ripple: 0.8194863661397112,
			'vue-vapor': 0.737882517895538,
			inferno: 0.8346306778909413,
		},
		{
			op: 'weather-app',
			'octane-tsrx': 1,
			react: 1.1557309311140525,
			preact: 1.5205745578183005,
			solid: 1.1471556722238014,
			svelte: 1.2878459666606124,
			inferno: 1.4132901011759498,
		},
		{
			op: 'weather-app-lighthouse',
			'octane-tsrx': 1,
			react: 0.9672697827938426,
			preact: 0.8199622072204233,
			solid: 0.877417717742211,
			svelte: 0.8402988024470894,
			inferno: 0.7950510576487744,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 1.4825517910960058,
			preact: 1.5627162360408868,
			solid: 1.3642661293265608,
			svelte: 1.353796087901814,
			ripple: 0.4880569871138087,
			'vue-vapor': 0.680666544399738,
			inferno: 0.6121688046738557,
		},
		{
			op: 'svg-dashboard',
			'octane-tsrx': 1,
			react: 1.0239114860808116,
			solid: 1.5564466984717962,
			svelte: 1.1209834538361063,
			inferno: 0.7569248127094647,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.290204264725594,
			preact: 5.941271719465277,
			solid: 1.13919726561032,
			svelte: 1.5246059321925962,
			ripple: 0.800978766619578,
			'vue-vapor': 1.839495267686022,
			inferno: 1.4436168852561804,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.3138895033646432,
			preact: 1.8951849001163312,
			solid: 2.0357102990829676,
			svelte: 1.0112996015840352,
			ripple: 0.652461295333685,
			'vue-vapor': 0.7836037856290501,
			inferno: 0.7824843963757828,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 0.8752407214062728,
			preact: 2.9863563990770334,
			solid: 0.7843444166696376,
			svelte: 0.614472361963083,
			ripple: 0.5634783691549606,
			'vue-vapor': 0.9702006676518156,
			inferno: 1.029445856902619,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 1.6782983356428556,
			preact: 9.129186023711595,
			solid: 0.5431060182375972,
			svelte: 1.4362034209746088,
			ripple: 0.21499737530880753,
			'vue-vapor': 0.5024755314211944,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 0.8762471826120332,
			preact: 0.7994983200797232,
			solid: 0.735801147525438,
			svelte: 1.4209954442377848,
			ripple: 0.29055821940918686,
			'vue-vapor': 0.9221110127537857,
			inferno: 0.330468318479915,
		},
		{
			op: 'spa-navigation',
			'octane-tsrx': 1,
			react: 0.9893179009790526,
			solid: 2.35291487995701,
			'vue-vapor': 1.6585095470720983,
			inferno: 0.7144106688581066,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 3.4790925763151908,
			preact: 5.126388927825699,
			solid: 0.8984043775727666,
			svelte: 0.983815393822224,
			ripple: 0.35320676938458495,
			'vue-vapor': 0.42411294178706865,
			inferno: 3.056153865159616,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 1.3066687617361648,
			preact: 6.042068835609351,
			solid: 0.7657545902399953,
			svelte: 1.6927719552563412,
			ripple: 0.5268827952566896,
			'vue-vapor': 1.002059397739628,
			inferno: 1.1757864008538002,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 9.708849135578298,
			preact: 7.265354710907943,
			solid: 0.796178799149451,
			svelte: 0.7966435713271027,
			ripple: 0.7548695296348125,
			inferno: 0.7504928925841107,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 2.3305228103052102,
			preact: 1.7053265913799043,
			solid: 1.1227109904364516,
			svelte: 0.6627890371782782,
			ripple: 0.6871832160674098,
			'vue-vapor': 0.6834605823645263,
			inferno: 0.7975835750934253,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 0.9612531555204421,
			preact: 1.2410647245230537,
			solid: 3.2395396409444226,
			ripple: 1.0716351165960423,
			inferno: 1.6539544344260824,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 1.6203628184307166,
			preact: 0.21731227512460327,
			solid: 0.39853721234679107,
			svelte: 0.4323894770602577,
			ripple: 0.4205161339571263,
			'vue-vapor': 0.525898856581024,
			inferno: 0.2730243976919936,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.9280847640871706,
			preact: 2.1592986563306593,
			solid: 1.9409215926743808,
			svelte: 1.4329752818251378,
			ripple: 1.5073426973624668,
			'vue-vapor': 1.0983222629743146,
			inferno: 2.0253053582213982,
		},
	],
	iterations: 0,
	format: 'x',
	ceilings: {
		'bundle-size': {
			'octane-tsrx': 4.559870489088269,
			preact: 0.3228767925547798,
			solid: 1.0527249020551022,
			svelte: 0.8990099475810306,
			ripple: 0.8048586660485674,
			'vue-vapor': 2.1683765021228605,
		},
	},
};

// `ceiling` reads each row's upper end instead of its value, still divided by
// Octane's row value, so a range shares the one 1× baseline.
function geomeanVsOctane(card: BenchCard, key: string, ceiling = false): number | undefined {
	const ratios: number[] = [];
	for (const row of card.rows) {
		const octane = row['octane-tsrx'];
		const measured = row[key];
		if (typeof octane !== 'number' || octane <= 0 || typeof measured !== 'number' || measured <= 0)
			continue;
		const value = ceiling ? card.ceilings?.[row.op]?.[key] : measured;
		if (value === undefined) return undefined; // a partial range would mix fixtures
		ratios.push(value / octane);
	}
	if (ratios.length === 0) return undefined;
	return Math.exp(ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0) / ratios.length);
}

export function createHomeSummary(cards: BenchCard[]): BenchCard {
	const ceilings: Record<string, Record<string, number>> = {};
	const rows: BenchRow[] = cards.map((card) => {
		const row: BenchRow = { op: card.id, 'octane-tsrx': 1 };
		for (const series of SUMMARY_SERIES) {
			if (series.key === 'octane-tsrx') continue;
			const geomean = geomeanVsOctane(card, series.key);
			if (geomean !== undefined) row[series.key] = geomean;
		}
		if (card.ceilings) {
			const upper: Record<string, number> = {};
			for (const series of SUMMARY_SERIES) {
				const geomean = geomeanVsOctane(card, series.key, true);
				if (geomean !== undefined) upper[series.key] = geomean;
			}
			ceilings[card.id] = upper;
		}
		return row;
	});
	return { ...HOME_SUMMARY, rows, ceilings };
}
