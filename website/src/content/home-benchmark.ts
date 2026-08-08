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
			react: 3.832224250212751,
			preact: 3.138875387074444,
			solid: 1.6143883373903183,
			svelte: 2.5571827880758313,
			ripple: 1.702594313840777,
			'vue-vapor': 1.0184131475195801,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 3.89201180233151,
			preact: 3.627007278328838,
			solid: 2.0647728557695735,
			svelte: 1.7563824704192903,
			ripple: 1.2243780045928563,
			'vue-vapor': 1.4835252389642104,
		},
		{
			op: 'weather-app',
			'octane-tsrx': 1,
			react: 1.266323042693476,
			preact: 1.353766384351486,
			solid: 1.1342379468942232,
			svelte: 0.9485618664070963,
		},
		{
			op: 'weather-app-lighthouse',
			'octane-tsrx': 1,
			react: 0.9996733289781274,
			preact: 0.7975309525150063,
			solid: 0.8299742559835969,
			svelte: 0.8251639678323414,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 3.602823130812655,
			preact: 2.848638015893854,
			solid: 1.5050598885260176,
			svelte: 2.1573123971853105,
			ripple: 1.1730995503312371,
			'vue-vapor': 1.119863770564724,
		},
		{
			op: 'svg-dashboard',
			'octane-tsrx': 1,
			react: 1.1574241696621799,
			solid: 1.3836155122721023,
			svelte: 1.0943891588052108,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 3.026197484584758,
			preact: 6.3281587615650094,
			solid: 1.6085040451205703,
			svelte: 2.342582303613579,
			ripple: 1.6397205897509912,
			'vue-vapor': 2.240359948326314,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.8209368924410185,
			preact: 2.017370523774914,
			solid: 2.847014584527841,
			svelte: 1.237789904290743,
			ripple: 1.2228219254843358,
			'vue-vapor': 1.0983204767652552,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 0.8057531592480813,
			preact: 3.7492930869387524,
			solid: 0.604517464331512,
			svelte: 0.7807878223782083,
			ripple: 1.0455899687367345,
			'vue-vapor': 0.8038432654431024,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 3.6655106685547967,
			preact: 16.05273180088432,
			solid: 0.9353880825365903,
			svelte: 3.0462503357455715,
			ripple: 6.235017082313816,
			'vue-vapor': 0.8536764890576067,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.378094511855146,
			preact: 1.1304074619905502,
			solid: 0.9916948037298225,
			svelte: 1.7032518748928065,
			ripple: 0.7044740434505392,
			'vue-vapor': 1.0871279809889978,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 3.0005200271452726,
			preact: 3.2412381697800607,
			solid: 0.5920259019728563,
			svelte: 0.7172386458919384,
			ripple: 0.2890451063731001,
			'vue-vapor': 0.2955697942404428,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 2.1207740265495256,
			preact: 9.451911109749346,
			solid: 1.027226612265814,
			svelte: 2.5999780816152245,
			ripple: 3.2923430556415214,
			'vue-vapor': 1.1559840960857548,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 11.306815525367341,
			preact: 8.634584921426397,
			solid: 0.8954591553956868,
			svelte: 0.8993169553733636,
			ripple: 0.9005515948097647,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 3.226454009969707,
			preact: 2.0628236467725367,
			solid: 1.8886677016580653,
			svelte: 1.0469407438018528,
			ripple: 1.7351127557683785,
			'vue-vapor': 1.314615434891472,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 1.0072502238814829,
			preact: 1.0431903246248262,
			solid: 3.502400258092015,
			ripple: 0.8726073873272912,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 2.376155070986265,
			preact: 0.3209549556050114,
			solid: 0.547964619046251,
			svelte: 0.7422543321713078,
			ripple: 0.5514660265789871,
			'vue-vapor': 1.0076861668606627,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.429247152219852,
			preact: 2.3089626181102303,
			solid: 1.5410110936148171,
			svelte: 0.9877924405504658,
			ripple: 1.3948213164930965,
			'vue-vapor': 0.8556431586671318,
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
