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
			react: 2.835401487721683,
			preact: 2.217947137461629,
			solid: 0.9967533802693938,
			svelte: 1.5604511191659198,
			ripple: 0.6822892272773937,
			'vue-vapor': 1.103481675354093,
			inferno: 0.9575726454615495,
		},
		{
			op: 'uibench',
			'octane-tsrx': 1,
			react: 2.7591780852102215,
			preact: 5.513671267604853,
			solid: 13.878776228051988,
			ripple: 0.7448054041805475,
			'vue-vapor': 1.3525906608920815,
			inferno: 2.0744009477441208,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 2.932870165790226,
			preact: 2.766955616557592,
			solid: 1.2419408320386944,
			svelte: 1.0939534760716478,
			ripple: 0.5491613425940712,
			'vue-vapor': 0.7475827621641762,
			inferno: 1.1020553327793814,
		},
		{
			op: 'weather-app',
			'octane-tsrx': 1,
			react: 1.067446789816244,
			preact: 1.4450854382620666,
			solid: 1.135215602499202,
			svelte: 1.0173945403055284,
			inferno: 1.22077701399367,
		},
		{
			op: 'weather-app-lighthouse',
			'octane-tsrx': 1,
			react: 0.9945530628070188,
			preact: 0.7709732327987027,
			solid: 0.8444062335428061,
			svelte: 0.8951396482625948,
			inferno: 0.8224508783684331,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 2.2309080495444964,
			preact: 2.414947439587585,
			solid: 1.7011198887288153,
			svelte: 2.1041410048668023,
			ripple: 0.7138672209501271,
			'vue-vapor': 0.9144471206334702,
			inferno: 1.1250970087117707,
		},
		{
			op: 'svg-dashboard',
			'octane-tsrx': 1,
			react: 1.0045312007706484,
			solid: 1.5458054623040032,
			svelte: 1.1332717124220606,
			inferno: 0.7795448941346732,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.412892729788953,
			preact: 5.557872339605776,
			solid: 1.1335675047481362,
			svelte: 1.671485933570386,
			ripple: 0.6939277207644765,
			'vue-vapor': 1.8271610535362033,
			inferno: 1.4815932755167052,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.5893924793655665,
			preact: 1.6113469485891756,
			solid: 2.3088430047626503,
			svelte: 1.0250266045491647,
			ripple: 0.922538600844407,
			'vue-vapor': 0.9042042859516968,
			inferno: 0.8848748786401981,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 0.6237927565225865,
			preact: 4.036522799706252,
			solid: 0.5737097582570398,
			svelte: 0.6851242113400352,
			ripple: 0.4101650091978305,
			'vue-vapor': 0.9646993315620048,
			inferno: 0.9348087679172602,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 2.2214861695418575,
			preact: 10.760380959211684,
			solid: 0.6898152500899426,
			svelte: 1.887237843149998,
			ripple: 0.31034904287538834,
			'vue-vapor': 0.735391409212532,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 0.8619685406656447,
			preact: 0.9331299492910655,
			solid: 0.7043205486831907,
			svelte: 1.6839175814125205,
			ripple: 0.35033030108026375,
			'vue-vapor': 0.9490157744674099,
			inferno: 0.3854576528606367,
		},
		{
			op: 'spa-navigation',
			'octane-tsrx': 1,
			react: 0.9725531195247816,
			solid: 2.311104068008005,
			'vue-vapor': 1.5728123274219454,
			inferno: 0.688910022535447,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 5.058622807776845,
			preact: 7.211971682928872,
			solid: 1.1903175969226596,
			svelte: 1.0547074601026767,
			ripple: 0.41234959832716467,
			'vue-vapor': 0.5458174011015796,
			inferno: 3.8387309583930964,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 1.410716136312764,
			preact: 5.660278229367174,
			solid: 0.5770097378814589,
			svelte: 1.377124237186902,
			ripple: 0.396486408471346,
			'vue-vapor': 0.7915350677210075,
			inferno: 1.3858413414742263,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 10.517665362086662,
			preact: 7.747157725931335,
			solid: 0.8703530481042349,
			svelte: 0.8080709322330066,
			ripple: 0.8209964541846145,
			inferno: 0.7950475595288012,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 1.918962740062374,
			preact: 1.2754607767442716,
			solid: 1.098462163517774,
			svelte: 0.6759639846313381,
			ripple: 0.6802122059890401,
			'vue-vapor': 0.7081934301464923,
			inferno: 0.8245667368156142,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 1.118322012169032,
			preact: 1.2843878240190132,
			solid: 3.6831130217058146,
			ripple: 0.9333036940207939,
			inferno: 1.5788392439117795,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 1.4949239462963595,
			preact: 0.20048924858849604,
			solid: 0.36768482678738373,
			svelte: 0.3989164500885996,
			ripple: 0.3887964662165639,
			'vue-vapor': 0.4887015764838286,
			inferno: 0.2518884692924428,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.7008705572215774,
			preact: 2.4816196500638585,
			solid: 1.948628358416811,
			svelte: 1.7227414183209229,
			ripple: 1.4377486912911621,
			'vue-vapor': 1.0890929806636107,
			inferno: 1.9117432810213455,
		},
	],
	iterations: 0,
	format: 'x',
	ceilings: {
		'bundle-size': {
			'octane-tsrx': 4.202415266266638,
			preact: 0.29788158763169037,
			solid: 0.9712291883300528,
			svelte: 0.8294139332937194,
			ripple: 0.744147917034177,
			'vue-vapor': 2.01500536032192,
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
