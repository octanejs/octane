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
			react: 3.4141779229925593,
			preact: 2.4786290778902518,
			solid: 1.4348987545356864,
			svelte: 2.2439505016668178,
			ripple: 1.1938910022696145,
			'vue-vapor': 0.9701859548777659,
			inferno: 1.37365269973199,
		},
		{
			op: 'uibench',
			'octane-tsrx': 1,
			react: 3.0919125760290473,
			preact: 5.2186744183565255,
			solid: 11.740457707448503,
			ripple: 0.8269947044950918,
			'vue-vapor': 1.2599799334814918,
			inferno: 2.33155840307218,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 1.930539145193604,
			preact: 2.362353596762981,
			solid: 1.3020171076028662,
			svelte: 1.1259098669008025,
			ripple: 0.6590493779163978,
			'vue-vapor': 0.8560201473961603,
			inferno: 1.1414472889967446,
		},
		{
			op: 'weather-app',
			'octane-tsrx': 1,
			react: 1.377103353067277,
			preact: 1.3608835335917444,
			solid: 1.300634337907756,
			svelte: 1.0157922075343233,
			inferno: 1.4108219893095613,
		},
		{
			op: 'weather-app-lighthouse',
			'octane-tsrx': 1,
			react: 1.0229731069760994,
			preact: 0.8498643883607669,
			solid: 0.8800674400642915,
			svelte: 0.9270647012029234,
			inferno: 0.8439934753847288,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 2.207049248642987,
			preact: 2.1771463046287476,
			solid: 1.409241778865416,
			svelte: 1.6167149975050714,
			ripple: 0.7932005786112819,
			'vue-vapor': 0.8689185456940405,
			inferno: 1.0412689343110266,
		},
		{
			op: 'svg-dashboard',
			'octane-tsrx': 1,
			react: 0.963497332580664,
			solid: 1.356220323271123,
			svelte: 1.050364020320011,
			inferno: 0.7333064622311098,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.1461305411555984,
			preact: 4.814190110451563,
			solid: 1.1539487690776262,
			svelte: 1.4990002073335789,
			ripple: 0.636612973946866,
			'vue-vapor': 1.7961397198656317,
			inferno: 1.3511984808335122,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.6602568164547553,
			preact: 1.8164182599639422,
			solid: 2.1951956211327017,
			svelte: 1.150512234070707,
			ripple: 1.0418977010286474,
			'vue-vapor': 0.9950735904515245,
			inferno: 1.0185183480827036,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 0.608184194234358,
			preact: 3.1116542956492115,
			solid: 0.5973167812372402,
			svelte: 0.608861485003343,
			ripple: 0.9504772088961841,
			'vue-vapor': 0.6907522185828193,
			inferno: 0.8510702617652077,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 2.168689606017978,
			preact: 10.60755632765763,
			solid: 0.6345983093006693,
			svelte: 2.126012675610397,
			ripple: 0.4823035468785254,
			'vue-vapor': 0.6152094207724293,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.0932576154793183,
			preact: 0.9767393216881848,
			solid: 0.7473384313081672,
			svelte: 1.4747725940909517,
			ripple: 0.685310535305405,
			'vue-vapor': 0.74476821306006,
			inferno: 0.43814807940694445,
		},
		{
			op: 'spa-navigation',
			'octane-tsrx': 1,
			react: 0.9795159178078079,
			solid: 2.4950980579596838,
			'vue-vapor': 1.586340890694012,
			inferno: 0.7620506610956674,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 6.035156308686666,
			preact: 6.160191061093285,
			solid: 1.2339492876064342,
			svelte: 1.6228336882857555,
			ripple: 0.5187597076063449,
			'vue-vapor': 0.7157490200400047,
			inferno: 3.8038384621527843,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 1.3271064896307587,
			preact: 5.6176798000396975,
			solid: 0.5361345123291681,
			svelte: 1.7280806658132806,
			ripple: 0.75690222623318,
			'vue-vapor': 0.7070598616879029,
			inferno: 1.8758025635594437,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 11.104599825811466,
			preact: 8.423143612512359,
			solid: 0.8694680067451379,
			svelte: 0.8758795189843538,
			ripple: 0.8528419982027068,
			inferno: 0.8605625712118692,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 2.1538730038953635,
			preact: 1.3585107258984639,
			solid: 1.4326385605901255,
			svelte: 0.7152879993671579,
			ripple: 1.2158070389623674,
			'vue-vapor': 0.8601557601689171,
			inferno: 0.9305511849620052,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 1.1640747618322582,
			preact: 1.367156456496148,
			solid: 3.3605340807964152,
			ripple: 1.0983770662010346,
			inferno: 1.3667113312755805,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 1.7339357865070821,
			preact: 0.23420831837769301,
			solid: 0.43930711040234716,
			svelte: 0.5416403015765905,
			ripple: 0.41001104960101836,
			'vue-vapor': 0.7228472787648547,
			inferno: 0.29280537313188,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.3540951491912385,
			preact: 2.2276034322009894,
			solid: 1.4546816572672552,
			svelte: 0.9712575310844845,
			ripple: 1.3937397359678187,
			'vue-vapor': 0.8650764640992143,
			inferno: 1.869323367805348,
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
