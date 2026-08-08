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
			react: 4.128668170092969,
			preact: 3.954672830001569,
			solid: 1.804914609522844,
			svelte: 2.6371938851620755,
			ripple: 1.9302352397069409,
			'vue-vapor': 1.301825663260709,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 5.421386555619632,
			preact: 4.052608431570363,
			solid: 2.7989541186566465,
			svelte: 2.048826342237706,
			ripple: 1.403689973144546,
			'vue-vapor': 1.2797451455372872,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 2.2681037450825783,
			preact: 1.9858710692676935,
			solid: 0.7891019339550873,
			svelte: 1.2978312419855307,
			ripple: 0.6381005198161992,
			'vue-vapor': 0.6590465367294496,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.642964871117062,
			preact: 5.460676554790141,
			solid: 1.4232743758940378,
			svelte: 1.9743413547144795,
			ripple: 1.5538199934912238,
			'vue-vapor': 2.0815541505586,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.6941505703491286,
			preact: 1.803037008236134,
			solid: 2.526178092372295,
			svelte: 1.1016966594527087,
			ripple: 1.1450347445647622,
			'vue-vapor': 0.9965380099397371,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 0.9235793473820437,
			preact: 3.5976363718977664,
			solid: 0.7415052230397119,
			svelte: 0.7308428293008764,
			ripple: 1.043646961505671,
			'vue-vapor': 0.6486592525215138,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 2.9630791807748795,
			preact: 9.597874522162863,
			solid: 0.5376829045032361,
			svelte: 1.7776079537169325,
			ripple: 3.495487620447002,
			'vue-vapor': 0.5004203523897879,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 2.1620333839289687,
			preact: 1.799715413877243,
			solid: 1.782584275338248,
			svelte: 3.1537092105897386,
			ripple: 1.0416786315273237,
			'vue-vapor': 1.2334070931903713,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 3.929160173682056,
			preact: 3.9975890639639498,
			solid: 0.697393105145053,
			svelte: 0.7934536257985582,
			ripple: 0.22947666267695327,
			'vue-vapor': 0.40683421251416596,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 1.8658222449606046,
			preact: 7.891343049251374,
			solid: 0.8764832455449274,
			svelte: 2.4267278166079063,
			ripple: 2.5393260782142555,
			'vue-vapor': 1.0661932034031185,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 11.410729274764236,
			preact: 8.702119154703896,
			solid: 0.8993579680538706,
			svelte: 0.9067166040191826,
			ripple: 0.8871556189987003,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 2.616817046376535,
			preact: 2.0043947792225434,
			solid: 1.8951937336066564,
			svelte: 1.11833152740852,
			ripple: 1.912049134974686,
			'vue-vapor': 1.567219977681768,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 0.9197639376596985,
			preact: 1.0458865999408025,
			solid: 4.470587749195336,
			ripple: 1.39410357681261,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 2.3690636188938523,
			preact: 0.3202156436176763,
			solid: 0.545945009102024,
			svelte: 0.7403377221643845,
			ripple: 0.5483238416576033,
			'vue-vapor': 1.0023545998615215,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.6885482743362887,
			preact: 2.7592406326266747,
			solid: 2.0775290833892734,
			svelte: 1.365275078029197,
			ripple: 1.8760815736871046,
			'vue-vapor': 1.1540290579309984,
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
