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
	title: 'Every suite at a glance',
	description:
		'Geometric mean of each suite’s per-operation scores, relative to Octane. Lower is better.',
	series: SUMMARY_SERIES,
	rows: [
		{
			op: 'js-framework',
			'octane-tsrx': 1,
			react: 2.480375737627769,
			preact: 2.1893189546825687,
			solid: 1.0596186159608485,
			svelte: 1.5401410545524792,
			ripple: 1.036498158344944,
			'vue-vapor': 1.0056082393664825,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 2.376374319341486,
			preact: 2.3959921334852243,
			solid: 1.232741430604036,
			svelte: 1.1671354101315925,
			ripple: 0.7754292485802883,
			'vue-vapor': 0.9149850050548094,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 3.801625501359977,
			preact: 2.698280528792754,
			solid: 1.3662178647439147,
			svelte: 1.9990084646803994,
			ripple: 1.1781381264397628,
			'vue-vapor': 1.0579352862900402,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.9437730381872966,
			preact: 6.438642827129895,
			solid: 1.5371309752506903,
			svelte: 2.2483902526136337,
			ripple: 1.5801345064924264,
			'vue-vapor': 2.197724595719406,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.8457931462340968,
			preact: 2.005701721226681,
			solid: 2.7772480140048343,
			svelte: 1.2205784941395428,
			ripple: 1.1956473135760661,
			'vue-vapor': 1.08990271704187,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 2.256427380624422,
			preact: 3.634019506656344,
			solid: 0.5906153407328426,
			svelte: 0.736103268906339,
			ripple: 1.0261204047837562,
			'vue-vapor': 0.6569754470129473,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 6.10977707026665,
			preact: 7.535690574559004,
			solid: 0.3858330362811667,
			svelte: 1.2094801837765212,
			ripple: 2.4473827149705727,
			'vue-vapor': 0.3542618629500014,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.2825363020836065,
			preact: 1.0045624188006594,
			solid: 1.0061672049805483,
			svelte: 1.6549769190733101,
			ripple: 0.8200857352584343,
			'vue-vapor': 0.9018234686637517,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 5.874828547263016,
			preact: 3.1793814171038832,
			solid: 0.659343804209086,
			svelte: 0.7824530411290882,
			ripple: 0.2853214504414705,
			'vue-vapor': 0.31301795782524877,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 7.6359178175358995,
			preact: 9.647756484216796,
			solid: 0.9131225710201385,
			svelte: 2.78954685760172,
			ripple: 3.225794417074988,
			'vue-vapor': 1.1516479613877006,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 11.462334184468805,
			preact: 8.704412045969272,
			solid: 0.9033753103679233,
			svelte: 0.8999573113255571,
			ripple: 0.880645400314582,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 3.06638814544723,
			preact: 1.9965808195834784,
			solid: 1.8255857562508058,
			svelte: 1.0540730849700255,
			ripple: 1.7563885459824236,
			'vue-vapor': 1.2586283978642616,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 0.9926710705266257,
			preact: 1.0648263401989961,
			solid: 3.3299760204889868,
			ripple: 0.9285170696037361,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 0.9421838094255819,
			preact: 0.5734568247709719,
			solid: 0.6869665062890558,
			svelte: 0.8089770498899758,
			ripple: 0.769119936718992,
			'vue-vapor': 0.6859516075794629,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.4332111167446633,
			preact: 2.2730524312628897,
			solid: 1.5783648128031325,
			svelte: 0.9659347233071844,
			ripple: 1.3867765708158601,
			'vue-vapor': 0.864254589054599,
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
