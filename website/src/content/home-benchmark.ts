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
			react: 2.5259793916073665,
			preact: 2.353680052514317,
			solid: 1.0550160225204503,
			svelte: 1.6365838902466334,
			ripple: 1.108080289861179,
			'vue-vapor': 1.0216517465519297,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 2.238097854773809,
			preact: 2.351443365455904,
			solid: 1.2977766773914723,
			svelte: 1.1845799082733202,
			ripple: 0.7140957370576574,
			'vue-vapor': 0.85638669224901,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 3.732171125963907,
			preact: 2.5250992086877067,
			solid: 1.3840204186196021,
			svelte: 1.9105352288264912,
			ripple: 1.0151416601041372,
			'vue-vapor': 0.9080009260902738,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 3.0663966726115524,
			preact: 6.471962528912718,
			solid: 1.5541634576495376,
			svelte: 2.3154038211477883,
			ripple: 1.6182033638191886,
			'vue-vapor': 2.259629479353902,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.8957671179356084,
			preact: 2.051577566214464,
			solid: 2.783615967638954,
			svelte: 1.2342860535113902,
			ripple: 1.18690688728923,
			'vue-vapor': 1.103771224058623,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 2.3039200897503664,
			preact: 3.68514458757824,
			solid: 0.6713709016805122,
			svelte: 0.7261758031826775,
			ripple: 1.0440475167186212,
			'vue-vapor': 0.6563661442591564,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 6.114878183494982,
			preact: 7.566909024165875,
			solid: 0.39783586567257656,
			svelte: 1.2186526573553556,
			ripple: 2.512914921971175,
			'vue-vapor': 0.3530718067378408,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.2501696506402973,
			preact: 1.0571415335954368,
			solid: 0.9168207529400402,
			svelte: 1.5935387038176367,
			ripple: 0.655399313508386,
			'vue-vapor': 0.7090540642177217,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 5.881223980753839,
			preact: 3.2863424949939484,
			solid: 0.6924693766636981,
			svelte: 0.7924617926610608,
			ripple: 0.22847356819381415,
			'vue-vapor': 0.3757086002921659,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 8.162906739941818,
			preact: 10.165373219304513,
			solid: 0.9687696714644747,
			svelte: 2.4176368315292605,
			ripple: 3.578059132822047,
			'vue-vapor': 1.3621068004005383,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 11.865975346154826,
			preact: 9.027791493932217,
			solid: 0.9292196214791824,
			svelte: 0.9391408270305588,
			ripple: 0.9181213686878709,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 3.0237980284743395,
			preact: 1.960985971670615,
			solid: 1.8859055355601027,
			svelte: 1.0213972875692932,
			ripple: 1.707825732401409,
			'vue-vapor': 1.288683314492538,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 1.103988608080395,
			preact: 1.0289373822799461,
			solid: 3.484718762308152,
			ripple: 0.870135405432781,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 0.9667410604831363,
			preact: 0.5884035082903527,
			solid: 0.7048717268992002,
			svelte: 0.8300623756143264,
			ripple: 0.7891664193590342,
			'vue-vapor': 0.6862551931697094,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.447393827877545,
			preact: 2.2466755246835777,
			solid: 1.510708706312293,
			svelte: 0.9676906413370823,
			ripple: 1.3611314087131148,
			'vue-vapor': 0.8450659202031721,
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
