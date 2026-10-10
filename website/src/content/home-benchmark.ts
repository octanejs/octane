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
			react: 6.578137538358163,
			preact: 5.802455789842391,
			solid: 2.4544990263790494,
			svelte: 3.2142523768625626,
			ripple: 0.7883435709384281,
			'vue-vapor': 0.8194211067169501,
			inferno: 2.35981393346489,
		},
		{
			op: 'uibench',
			'octane-tsrx': 1,
			react: 2.8437575886303694,
			preact: 5.54883987656028,
			solid: 13.33417343679536,
			ripple: 0.7898380473571145,
			'vue-vapor': 0.934333738729737,
			inferno: 2.1190394651755575,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 3.0191624339697576,
			preact: 2.9797572318529406,
			solid: 1.5483272958876544,
			svelte: 1.4061170944404502,
			ripple: 0.8462260474641725,
			'vue-vapor': 0.8659361236855024,
			inferno: 1.255662823981281,
		},
		{
			op: 'weather-app',
			'octane-tsrx': 1,
			react: 1.2793141735695508,
			preact: 1.286469196857023,
			solid: 1.1355885110920858,
			svelte: 0.9574753720906701,
			inferno: 1.2371919494726549,
		},
		{
			op: 'weather-app-lighthouse',
			'octane-tsrx': 1,
			react: 1.0335787193869215,
			preact: 0.8126842301044396,
			solid: 0.8545583306785147,
			svelte: 0.8995809699904487,
			inferno: 0.8162457699298222,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 1.9133238437494153,
			preact: 1.949574413458198,
			solid: 1.3740291956994508,
			svelte: 1.7214960266231703,
			ripple: 0.6522687968827854,
			'vue-vapor': 0.6072485359438752,
			inferno: 0.904695646328244,
		},
		{
			op: 'svg-dashboard',
			'octane-tsrx': 1,
			react: 1.0327492045209026,
			solid: 1.2573054477676153,
			svelte: 1.1604793309229264,
			inferno: 0.7658871384716827,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.4022854958196653,
			preact: 5.748204468432856,
			solid: 0.9318944185875976,
			svelte: 1.5929715372053475,
			ripple: 0.7171600858073182,
			'vue-vapor': 0.8928100309440322,
			inferno: 1.5068694255036361,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.5202834551843458,
			preact: 1.8496459879074574,
			solid: 2.27627071234216,
			svelte: 1.04213555107827,
			ripple: 0.9812814993282862,
			'vue-vapor': 0.9524785913854569,
			inferno: 0.9521496767469589,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 0.6550479475538185,
			preact: 3.772963495725423,
			solid: 0.47566846026350507,
			svelte: 0.5934155588345492,
			ripple: 0.3608117311021961,
			'vue-vapor': 1.1288425430269893,
			inferno: 0.8417230992183437,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 2.216280608689501,
			preact: 10.835065326037014,
			solid: 0.7332540081111562,
			svelte: 2.073621377482808,
			ripple: 0.30751035631608836,
			'vue-vapor': 0.6486812874234842,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 0.9761135061246302,
			preact: 1.0914289971957583,
			solid: 0.8839443324745817,
			svelte: 1.643737862297896,
			ripple: 0.3119412958809143,
			'vue-vapor': 1.29649335670988,
			inferno: 0.4371718633462533,
		},
		{
			op: 'spa-navigation',
			'octane-tsrx': 1,
			react: 0.9726414334318653,
			solid: 2.452916700306476,
			'vue-vapor': 1.9313765992106522,
			inferno: 0.7213654859484229,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 5.562946518476644,
			preact: 7.688140049623707,
			solid: 0.7725030504935566,
			svelte: 1.0105447218824277,
			ripple: 0.45531800889652085,
			'vue-vapor': 0.5754738286527085,
			inferno: 3.636362498527515,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 1.4931072474971023,
			preact: 6.791475210746611,
			solid: 0.6008040924333712,
			svelte: 1.9650367709914804,
			ripple: 0.48527020849897096,
			'vue-vapor': 0.7744395683663475,
			inferno: 1.8670961601318063,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 10.675945116256216,
			preact: 7.820596456582553,
			solid: 0.8467671763030901,
			svelte: 0.8253719221132482,
			ripple: 0.8146051813853071,
			inferno: 0.8060419151711076,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 2.076165286188782,
			preact: 1.3967259108131418,
			solid: 1.1552858814274671,
			svelte: 0.6578070134506535,
			ripple: 0.7810286156029944,
			'vue-vapor': 0.8510910934566771,
			inferno: 0.8380863670246151,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 0.9891736512751148,
			preact: 1.1894751550078622,
			solid: 1.6928638150123723,
			ripple: 0.8480331912642167,
			inferno: 1.2501267071383821,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 1.7797106508479938,
			preact: 0.238682945695969,
			solid: 0.468016020929296,
			svelte: 0.4812245433755072,
			ripple: 0.46906253936653275,
			'vue-vapor': 0.6632412890515862,
			inferno: 0.29987384491109614,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.641292198792332,
			preact: 2.5127850584037703,
			solid: 1.4903309286605282,
			svelte: 1.002571535183492,
			ripple: 1.4019888390835789,
			'vue-vapor': 1.0334563644483592,
			inferno: 1.8559925356213949,
		},
	],
	iterations: 0,
	format: 'x',
	ceilings: {
		'bundle-size': {
			'octane-tsrx': 5.026444370529913,
			preact: 0.3546287659068188,
			solid: 1.5276713027990718,
			svelte: 1.007361556323411,
			ripple: 0.8977754222538156,
			'vue-vapor': 2.7145009361953307,
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
