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
	{ key: 'solid', label: 'Solid 2.0 RC', color: '#1baf7a' },
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
			react: 7.031506988015009,
			preact: 6.4570204953494486,
			solid: 2.8730143582282732,
			svelte: 4.269802320546185,
			ripple: 0.8424539106838269,
			'vue-vapor': 0.8966129936023525,
			inferno: 2.541108014775768,
		},
		{
			op: 'uibench',
			'octane-tsrx': 1,
			react: 3.118933083180449,
			preact: 5.948280707107959,
			solid: 14.842838864101605,
			ripple: 0.9146703147402502,
			'vue-vapor': 1.0472064286820564,
			inferno: 2.505258825537795,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 3.208083404105509,
			preact: 3.4537376977326435,
			solid: 1.4278823932077909,
			svelte: 1.9487632391543528,
			ripple: 0.8412804719688659,
			'vue-vapor': 1.005491441412505,
			inferno: 1.648816784651556,
		},
		{
			op: 'weather-app',
			'octane-tsrx': 1,
			react: 1.2004770275501921,
			preact: 1.6030216078181678,
			solid: 1.3693234518171795,
			svelte: 1.1672441033876257,
			inferno: 1.2523812264171572,
		},
		{
			op: 'weather-app-lighthouse',
			'octane-tsrx': 1,
			react: 0.989718596566433,
			preact: 0.8304820799455168,
			solid: 0.8066550494265756,
			svelte: 0.8833647946963061,
			inferno: 0.8253209767506431,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 2.070142176021672,
			preact: 2.3274308138011763,
			solid: 1.507120090333977,
			svelte: 2.2102706523431395,
			ripple: 0.6827172784199812,
			'vue-vapor': 0.680550875600779,
			inferno: 0.9837291042589753,
		},
		{
			op: 'svg-dashboard',
			'octane-tsrx': 1,
			react: 1.0307997270219307,
			solid: 1.2751532529895788,
			svelte: 1.1622747682695838,
			inferno: 0.7858101647366994,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.3598253172729238,
			preact: 5.854251079956711,
			solid: 0.9292671495739199,
			svelte: 1.6565077783966613,
			ripple: 0.7203165259134741,
			'vue-vapor': 0.894195550960275,
			inferno: 1.4686503873512744,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.8398876038546994,
			preact: 2.1262088623351687,
			solid: 2.600443204278818,
			svelte: 1.0519078298837925,
			ripple: 0.9558642365932326,
			'vue-vapor': 0.9315992606572568,
			inferno: 0.8605687691594248,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 1.3099158574363692,
			preact: 7.446731553579486,
			solid: 0.9493884848916275,
			svelte: 1.1840610750629956,
			ripple: 0.7349808558891674,
			'vue-vapor': 1.062469630155181,
			inferno: 1.8313032797434698,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 2.42342042107516,
			preact: 13.57274323831663,
			solid: 0.8383520952082317,
			svelte: 2.395505561580577,
			ripple: 0.34082200812408103,
			'vue-vapor': 0.670336831582192,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.3543062956700807,
			preact: 0.9675963879924427,
			solid: 0.981617475493925,
			svelte: 1.698593455953861,
			ripple: 0.345578824467484,
			'vue-vapor': 0.9406896166952218,
			inferno: 0.4934844486207229,
		},
		{
			op: 'spa-navigation',
			'octane-tsrx': 1,
			react: 1.1644827344163686,
			solid: 2.712042338571152,
			'vue-vapor': 2.195575598926121,
			inferno: 0.8552972119264357,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 6.559935658472454,
			preact: 10.161933803289301,
			solid: 1.0983014340407418,
			svelte: 1.2722975401641574,
			ripple: 0.4824865482721581,
			'vue-vapor': 0.6239411717492483,
			inferno: 5.071909390094211,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 0.8189249007899448,
			preact: 4.46607361007439,
			solid: 0.5616382639233515,
			svelte: 1.2115070952434706,
			ripple: 0.2780332427599049,
			'vue-vapor': 0.6274405286593892,
			inferno: 1.0485576628170046,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 10.448780320490496,
			preact: 7.661680071012599,
			solid: 0.8369053306096021,
			svelte: 0.8209155867546477,
			ripple: 0.7995365662718572,
			inferno: 0.7929277531195444,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 2.03093084640015,
			preact: 1.2852800160335835,
			solid: 1.009967768590734,
			svelte: 0.6791038235013009,
			ripple: 0.7021518511639558,
			'vue-vapor': 1.1202347487394284,
			inferno: 0.7622950201033698,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 0.8802319804742086,
			preact: 0.885636424405917,
			solid: 1.4290442105538559,
			ripple: 0.7625081237316225,
			inferno: 1.2148955676490298,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 1.81105661553761,
			preact: 0.24288685782305242,
			solid: 0.4762591663300578,
			svelte: 0.48970032989576984,
			ripple: 0.4799434826622377,
			'vue-vapor': 0.6783305835552145,
			inferno: 0.3051555096297086,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 3.030717423550577,
			preact: 2.658720489778048,
			solid: 1.524965923317362,
			svelte: 0.9937690247917904,
			ripple: 1.4176373039174601,
			'vue-vapor': 1.043968610874871,
			inferno: 1.8978542268379075,
		},
	],
	iterations: 0,
	format: 'x',
	ceilings: {
		'bundle-size': {
			'octane-tsrx': 4.978931983701426,
			preact: 0.36087482661828374,
			solid: 1.554578109639871,
			svelte: 1.0251041706967898,
			ripple: 0.9186013092986729,
			'vue-vapor': 2.776258104714193,
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
