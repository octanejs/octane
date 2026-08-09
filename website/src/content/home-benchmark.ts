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
			react: 4.124078555102893,
			preact: 3.5592359536677804,
			solid: 1.7101873489216497,
			svelte: 2.667057903548862,
			ripple: 1.7161119650652648,
			'vue-vapor': 1.174637093134804,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 3.2721640747141962,
			preact: 3.295851533909521,
			solid: 1.7746197655867986,
			svelte: 1.635038856612626,
			ripple: 1.0789166490053808,
			'vue-vapor': 1.2408832290785201,
		},
		{
			op: 'weather-app',
			'octane-tsrx': 1,
			react: 1.3428560302891681,
			preact: 1.452094664969045,
			solid: 1.2728767774061571,
			svelte: 1.0516139015150052,
		},
		{
			op: 'weather-app-lighthouse',
			'octane-tsrx': 1,
			react: 1.144646116540544,
			preact: 0.9559034063605913,
			solid: 0.9403509883142704,
			svelte: 0.9607569547171527,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 3.5624474397289747,
			preact: 2.8046800860213623,
			solid: 1.4856079242681377,
			svelte: 2.1442811041053895,
			ripple: 1.1863419478765236,
			'vue-vapor': 1.0807709873121063,
		},
		{
			op: 'svg-dashboard',
			'octane-tsrx': 1,
			react: 1.1638021113179664,
			solid: 1.414559079601566,
			svelte: 1.1221235277368862,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.887105695319849,
			preact: 5.957058295235131,
			solid: 1.5163030628336767,
			svelte: 2.21649624184169,
			ripple: 1.53016859499492,
			'vue-vapor': 2.182519873529313,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.7534801523532484,
			preact: 1.9377171830081892,
			solid: 2.8000723948849067,
			svelte: 1.1917127117566966,
			ripple: 1.1763374772814355,
			'vue-vapor': 1.0778199214637636,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 0.7248349159328369,
			preact: 3.6197648219962906,
			solid: 0.587791047636255,
			svelte: 0.7397520638094183,
			ripple: 1.047496374527311,
			'vue-vapor': 0.8211543850463408,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 3.69867002856316,
			preact: 16.195079605723123,
			solid: 0.9455828450409042,
			svelte: 2.930398380201325,
			ripple: 5.947360452673593,
			'vue-vapor': 0.8510967272381222,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.4873117145551271,
			preact: 1.297128140022782,
			solid: 1.0208515978456114,
			svelte: 2.0631302239642797,
			ripple: 1.1791583177814902,
			'vue-vapor': 1.089363136548616,
		},
		{
			op: 'spa-navigation',
			'octane-tsrx': 1,
			react: 0.7876095285861537,
			solid: 0.8564444703063577,
			'vue-vapor': 1.1893337025984867,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 2.959092712040432,
			preact: 3.0429871451767214,
			solid: 0.5457379401052892,
			svelte: 0.7729891611666995,
			ripple: 0.21367084906469064,
			'vue-vapor': 0.29752105571092097,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 2.233495048639538,
			preact: 6.0772813803924866,
			solid: 1.0267076253524698,
			svelte: 2.5450369133953794,
			ripple: 2.70250809875665,
			'vue-vapor': 1.1482883625491769,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 11.459901559712554,
			preact: 8.725157768702777,
			solid: 0.907423008500988,
			svelte: 0.921327813095739,
			ripple: 0.8876808141535364,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 2.995004104737752,
			preact: 1.972719530395109,
			solid: 1.9214791555145347,
			svelte: 1.0010999798293996,
			ripple: 1.6835742218260177,
			'vue-vapor': 1.27801636170265,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 0.8064749823506967,
			preact: 1.1642838543774625,
			solid: 3.098030450820616,
			ripple: 0.682337935184752,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 3.0580548472688873,
			preact: 0.41306136528180704,
			solid: 0.7052173824289616,
			svelte: 0.9552636046858067,
			ripple: 0.7252656978726166,
			'vue-vapor': 1.3194266407216309,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.4385626723492373,
			preact: 2.2518749944084044,
			solid: 1.5534439254166204,
			svelte: 0.9809105496989878,
			ripple: 1.398349021445734,
			'vue-vapor': 0.8617094504383973,
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
