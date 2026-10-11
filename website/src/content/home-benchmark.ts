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
			react: 6.569210174268196,
			preact: 4.621263617288323,
			solid: 2.1984502335392357,
			svelte: 2.8879360143899,
			ripple: 0.6352412364433042,
			'vue-vapor': 0.6741146781087759,
			inferno: 1.8905113806356584,
		},
		{
			op: 'uibench',
			'octane-tsrx': 1,
			react: 2.926705956364936,
			preact: 6.573282753439849,
			solid: 15.331632255719763,
			ripple: 0.8702930948203047,
			'vue-vapor': 1.0148002550282607,
			inferno: 2.5802841788333772,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 2.8825476593682913,
			preact: 3.6087251198594097,
			solid: 1.6215890637050303,
			svelte: 1.4885111972456797,
			ripple: 0.7917935163840863,
			'vue-vapor': 0.8743650108470769,
			inferno: 1.7188417839527195,
		},
		{
			op: 'weather-app',
			'octane-tsrx': 1,
			react: 1.6483450941619417,
			preact: 1.6688915623653595,
			solid: 1.3972910749896714,
			svelte: 1.304752253029555,
			inferno: 1.3409671275959567,
		},
		{
			op: 'weather-app-lighthouse',
			'octane-tsrx': 1,
			react: 1.0453901987426992,
			preact: 0.8603968963965196,
			solid: 0.8724139650745706,
			svelte: 0.9267763088805522,
			inferno: 0.8412836902668247,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 2.2058360417559113,
			preact: 2.2034886078582576,
			solid: 1.481384875362564,
			svelte: 1.8724208866428236,
			ripple: 0.6011047311794149,
			'vue-vapor': 0.6338211986481337,
			inferno: 0.9388155105925506,
		},
		{
			op: 'svg-dashboard',
			'octane-tsrx': 1,
			react: 1.0128023421306822,
			solid: 1.2508756392286053,
			svelte: 1.1467237848571528,
			inferno: 0.7814510784062135,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.4839588953556935,
			preact: 5.7584942340698015,
			solid: 0.9971892786712343,
			svelte: 1.6166584081963122,
			ripple: 0.7293428265044877,
			'vue-vapor': 0.9224350939235414,
			inferno: 1.5330807590913416,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.7964247186158837,
			preact: 1.8586308975544328,
			solid: 2.769493355545916,
			svelte: 0.971963998801167,
			ripple: 1.0120151625062128,
			'vue-vapor': 0.8962112555735718,
			inferno: 0.9149584580254215,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 1.3019971465070248,
			preact: 6.944515397219128,
			solid: 1.0456613102203565,
			svelte: 1.1108320966326017,
			ripple: 0.6570941680076269,
			'vue-vapor': 0.8858202985047595,
			inferno: 1.6748479066053066,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 2.2874618394700064,
			preact: 11.670876205895592,
			solid: 0.7600325743927566,
			svelte: 2.083303043077771,
			ripple: 0.30975806327340283,
			'vue-vapor': 0.5963770827131119,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.1247288191475509,
			preact: 1.0364088001337504,
			solid: 1.122752892923691,
			svelte: 1.685707628589932,
			ripple: 0.49034623880328426,
			'vue-vapor': 1.1651987228315177,
			inferno: 0.617572473179201,
		},
		{
			op: 'spa-navigation',
			'octane-tsrx': 1,
			react: 0.9827736408290766,
			solid: 2.3977481551157522,
			'vue-vapor': 1.8927090952698213,
			inferno: 0.7519477828892768,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 5.926553025968026,
			preact: 7.810527215007395,
			solid: 0.8647506564446915,
			svelte: 1.1518639049982677,
			ripple: 0.4563177216855313,
			'vue-vapor': 0.5653469705166123,
			inferno: 3.5615489044446753,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 1.2653536669465901,
			preact: 6.1817513686347105,
			solid: 0.5710695954825927,
			svelte: 1.972370162139862,
			ripple: 0.3244362746888631,
			'vue-vapor': 0.9565042592571981,
			inferno: 1.6556057907691448,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 10.560490467729878,
			preact: 7.739612831087706,
			solid: 0.8360278950516735,
			svelte: 0.824547600146151,
			ripple: 0.7983438773024834,
			inferno: 0.7967238302326449,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 2.0482846202680043,
			preact: 1.3795611337648028,
			solid: 1.1145241347593398,
			svelte: 0.6722322843062387,
			ripple: 0.7691657339564171,
			'vue-vapor': 0.8084318805284347,
			inferno: 0.8403084860652443,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 1.0727630354377153,
			preact: 1.2289099708278792,
			solid: 1.8150739195736314,
			ripple: 1.0642609777054384,
			inferno: 1.367732874685093,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 1.8111505104958816,
			preact: 0.24289945038983604,
			solid: 0.47628385817799085,
			svelte: 0.48972571860623126,
			ripple: 0.47732919735760004,
			'vue-vapor': 0.6746910197470222,
			inferno: 0.3051713305397769,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.4478331893476963,
			preact: 2.467308261122994,
			solid: 1.4112398365032557,
			svelte: 0.8985937972126017,
			ripple: 1.2463311349276878,
			'vue-vapor': 1.0044964214406935,
			inferno: 1.8217865272524527,
		},
	],
	iterations: 0,
	format: 'x',
	ceilings: {
		'bundle-size': {
			'octane-tsrx': 5.12531166977891,
			preact: 0.36089353631874027,
			solid: 1.5546587073669005,
			svelte: 1.0251573176346083,
			ripple: 0.9135976245097902,
			'vue-vapor': 2.761362169361905,
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
