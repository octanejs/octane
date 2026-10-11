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
			react: 6.261020172697725,
			preact: 5.897116790537151,
			solid: 2.3587474034702853,
			svelte: 3.622099312397567,
			ripple: 0.7416530007878386,
			'vue-vapor': 0.7647769960055494,
			inferno: 2.5185817069988863,
		},
		{
			op: 'uibench',
			'octane-tsrx': 1,
			react: 2.7227128385007315,
			preact: 5.213681533315121,
			solid: 13.438412089108299,
			ripple: 0.7936226684366721,
			'vue-vapor': 0.9247178034965053,
			inferno: 2.0388843077551306,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 2.8997396816279726,
			preact: 3.220331868205119,
			solid: 1.3788402803313944,
			svelte: 1.2768724355436127,
			ripple: 0.6268951967558721,
			'vue-vapor': 0.7041651273323006,
			inferno: 1.121860162016434,
		},
		{
			op: 'weather-app',
			'octane-tsrx': 1,
			react: 1.2779231859069955,
			preact: 1.6665145558213008,
			solid: 1.2414803553233398,
			svelte: 1.0600385993275163,
			inferno: 1.4578526276486832,
		},
		{
			op: 'weather-app-lighthouse',
			'octane-tsrx': 1,
			react: 1.0372362996136588,
			preact: 0.8105604319538251,
			solid: 0.9021195340373132,
			svelte: 0.9216684907819009,
			inferno: 0.8436645547647614,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 2.1140176103708415,
			preact: 2.6358673125747916,
			solid: 1.5993427460505414,
			svelte: 2.070863868403255,
			ripple: 0.7763195021106326,
			'vue-vapor': 0.962241784317797,
			inferno: 1.0340269597964291,
		},
		{
			op: 'svg-dashboard',
			'octane-tsrx': 1,
			react: 0.9994794757610425,
			solid: 1.259943563397632,
			svelte: 1.144054238523338,
			inferno: 0.7734497479164353,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.3485862713512953,
			preact: 5.573614139100305,
			solid: 0.9211476807584826,
			svelte: 1.5798658109116785,
			ripple: 0.7077096476444819,
			'vue-vapor': 0.8809020951583738,
			inferno: 1.4842508084059225,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.6379122207547128,
			preact: 1.8557914086348106,
			solid: 2.437200985966259,
			svelte: 0.9376158062918248,
			ripple: 0.8928963766088465,
			'vue-vapor': 0.8669518334716455,
			inferno: 0.8514492349534509,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 1.44903219959911,
			preact: 7.681820754111076,
			solid: 1.0749108265973701,
			svelte: 1.2898728416060141,
			ripple: 0.757396355901293,
			'vue-vapor': 1.0091443412286425,
			inferno: 1.7576915961533528,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 2.180551885237912,
			preact: 11.050804089362884,
			solid: 0.7410321090042509,
			svelte: 2.021662673096079,
			ripple: 0.3110287268319587,
			'vue-vapor': 0.6269529169294152,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.3725748213664257,
			preact: 1.2622048002625712,
			solid: 0.9433188782522428,
			svelte: 2.5978258342450467,
			ripple: 0.3027725814037091,
			'vue-vapor': 1.3452346041166865,
			inferno: 0.694504162225599,
		},
		{
			op: 'spa-navigation',
			'octane-tsrx': 1,
			react: 0.9811692975638372,
			solid: 2.3532198802706428,
			'vue-vapor': 1.8810929096634201,
			inferno: 0.684373691853856,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 5.390874580870991,
			preact: 7.648118369602017,
			solid: 0.7588557305818175,
			svelte: 1.0140258506433715,
			ripple: 0.42724429166612976,
			'vue-vapor': 0.5521848174572601,
			inferno: 3.8610871986408153,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 1.2737326854149869,
			preact: 6.407344423924528,
			solid: 0.6134555223436615,
			svelte: 1.7212282639576773,
			ripple: 0.38123255129000677,
			'vue-vapor': 0.8707201083837608,
			inferno: 1.6793405991943045,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 10.407923167871058,
			preact: 7.628241096895926,
			solid: 0.8416354580859431,
			svelte: 0.8109821145252112,
			ripple: 0.7933825887905052,
			inferno: 0.7883648864438234,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 2.01431119086077,
			preact: 1.3731558924938,
			solid: 1.1088635752079485,
			svelte: 0.6044674166655335,
			ripple: 0.7590918528917687,
			'vue-vapor': 0.7079004316689992,
			inferno: 0.7538200875150773,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 1.093562708224689,
			preact: 1.2258216652561915,
			solid: 2.1478404616171747,
			ripple: 0.9876239903120752,
			inferno: 1.1013973297261639,
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
			react: 2.6010882582464023,
			preact: 2.52213644151749,
			solid: 1.468704192470975,
			svelte: 0.9763321228016976,
			ripple: 1.2897250765559598,
			'vue-vapor': 1.051919870930378,
			inferno: 1.7665643147427499,
		},
	],
	iterations: 0,
	format: 'x',
	ceilings: {
		'bundle-size': {
			'octane-tsrx': 5.125282871930782,
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
