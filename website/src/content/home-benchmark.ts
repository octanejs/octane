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
			react: 3.6198552498112284,
			preact: 2.7806398729143083,
			solid: 1.4666958582166196,
			svelte: 2.2900114615627154,
			ripple: 0.7538862748474713,
			'vue-vapor': 0.9843929788919141,
			inferno: 1.3663234724979598,
		},
		{
			op: 'uibench',
			'octane-tsrx': 1,
			react: 3.177122738970489,
			preact: 5.4631294487531035,
			solid: 13.010584584181025,
			ripple: 0.8541991337554075,
			'vue-vapor': 1.284277953370792,
			inferno: 2.387425169260233,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 1.8198124110038594,
			preact: 2.2592480029813005,
			solid: 1.351543752173071,
			svelte: 1.0055980643785145,
			ripple: 0.7277972539097723,
			'vue-vapor': 0.9186854844547503,
			inferno: 0.9869504078010348,
		},
		{
			op: 'weather-app',
			'octane-tsrx': 1,
			react: 1.1622859652625985,
			preact: 1.2073064716976718,
			solid: 1.1528521462958692,
			svelte: 0.9406506262617287,
			inferno: 1.251700626804185,
		},
		{
			op: 'weather-app-lighthouse',
			'octane-tsrx': 1,
			react: 1.0079872059018768,
			preact: 0.842640229106427,
			solid: 0.8727969556119769,
			svelte: 0.9077659293244592,
			inferno: 0.822490765748924,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 1.5589663798023756,
			preact: 2.021754575371311,
			solid: 1.2114282902734248,
			svelte: 1.2036974287842885,
			ripple: 0.5737276095173849,
			'vue-vapor': 0.8092055559205509,
			inferno: 0.7064450794923725,
		},
		{
			op: 'svg-dashboard',
			'octane-tsrx': 1,
			react: 1.0069508393323263,
			solid: 1.473708595995027,
			svelte: 1.0405908225923004,
			inferno: 0.7127275554004653,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.493301389407368,
			preact: 5.810421168984941,
			solid: 1.1647187788731548,
			svelte: 1.6417607575514843,
			ripple: 0.6734436404944378,
			'vue-vapor': 1.7956302892989933,
			inferno: 1.472159065292466,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.5205537737371861,
			preact: 1.6598753184772819,
			solid: 2.1265940084945836,
			svelte: 1.0217132839948273,
			ripple: 0.919641195600541,
			'vue-vapor': 0.8963778864052088,
			inferno: 0.9183592570732723,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 0.5773601772621006,
			preact: 2.9959255558732374,
			solid: 0.5322262369233519,
			svelte: 0.5580074311116942,
			ripple: 0.7628392718776875,
			'vue-vapor': 0.6509995866516757,
			inferno: 0.7824237939939562,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 2.1604820545201884,
			preact: 10.233578695320883,
			solid: 0.5837290504305801,
			svelte: 1.9448886396556249,
			ripple: 0.2449630957845125,
			'vue-vapor': 0.6098322990401555,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.1647716510963684,
			preact: 0.7960788289728992,
			solid: 0.7796216306927781,
			svelte: 1.5720784828167202,
			ripple: 0.48197217711791346,
			'vue-vapor': 0.7759555231389915,
			inferno: 0.36677319334325853,
		},
		{
			op: 'spa-navigation',
			'octane-tsrx': 1,
			react: 0.9056184830452662,
			solid: 2.37026469668429,
			'vue-vapor': 1.4681181480108343,
			inferno: 0.682166269282886,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 6.314506797528932,
			preact: 7.408556524916153,
			solid: 1.1400569665253388,
			svelte: 1.0386601852854345,
			ripple: 0.4604042060965652,
			'vue-vapor': 0.5303402246046907,
			inferno: 3.7973476402750164,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 1.0459491845136468,
			preact: 3.9220429420205014,
			solid: 0.5137035378309052,
			svelte: 1.3831640286934845,
			ripple: 0.30702012028883463,
			'vue-vapor': 0.7304160286032874,
			inferno: 1.1502942396600155,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 10.734891001764128,
			preact: 8.218203507116977,
			solid: 0.8583378501180156,
			svelte: 0.8532181719066781,
			ripple: 0.8444840479737423,
			inferno: 0.8538682599728286,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 1.813911477446616,
			preact: 1.1546634523027337,
			solid: 1.2128591346367448,
			svelte: 0.6526198551601418,
			ripple: 0.7093857080952135,
			'vue-vapor': 0.7524337228489761,
			inferno: 0.7088324446853418,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 0.8365434407939764,
			preact: 0.853929587614377,
			solid: 3.017724317368103,
			ripple: 0.9213562934525471,
			inferno: 1.1321338012959115,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 1.3405723882945593,
			preact: 0.1810754511033642,
			solid: 0.33964520876128235,
			svelte: 0.4187629313215917,
			ripple: 0.3503025821453758,
			'vue-vapor': 0.5428990033491582,
			inferno: 0.22637908590352562,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.3331234753380397,
			preact: 2.185368522738613,
			solid: 1.4759302481111547,
			svelte: 0.9284496814126093,
			ripple: 1.1920809998566746,
			'vue-vapor': 0.8392236564510885,
			inferno: 1.8859650182939518,
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
