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
			react: 4.467964206999877,
			preact: 3.9610796002257804,
			solid: 1.8029780240427107,
			svelte: 2.6144821652325283,
			ripple: 1.985461156493767,
			'vue-vapor': 1.099263414898243,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 2.2893346517253272,
			preact: 2.334026475033119,
			solid: 1.1721450201290007,
			svelte: 0.9207423547308995,
			ripple: 0.7814965122113626,
			'vue-vapor': 0.8827523433442114,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 4.3291397212376435,
			preact: 2.7773060102602662,
			solid: 1.5326089854321794,
			svelte: 1.718933273243917,
			ripple: 1.250805045823585,
			'vue-vapor': 1.0836122769555874,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.9737287660029823,
			preact: 6.098660225291841,
			solid: 1.5139273848372423,
			svelte: 2.137554982780973,
			ripple: 1.539507588229963,
			'vue-vapor': 2.114439508326289,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.785662421692435,
			preact: 1.9223448483645034,
			solid: 2.6514299203534715,
			svelte: 1.1926900799292646,
			ripple: 1.145242345264364,
			'vue-vapor': 1.0612367267596026,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 2.1086611270168527,
			preact: 3.697926696790093,
			solid: 0.6625860771631729,
			svelte: 0.7274091341020245,
			ripple: 1.0295796325727906,
			'vue-vapor': 1.6400107125245527,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 6.304580983190256,
			preact: 7.781796389928975,
			solid: 0.39113025325940975,
			svelte: 1.2662325798383782,
			ripple: 2.4691827545999376,
			'vue-vapor': 0.3675933284831232,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.3920643895261462,
			preact: 1.297211316777777,
			solid: 1.4753821883437916,
			svelte: 2.2951592058974155,
			ripple: 1.0810055385565702,
			'vue-vapor': 1.20739407194349,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 6.406190527841556,
			preact: 3.5153683178138846,
			solid: 0.6150574624051017,
			svelte: 0.8040934319438481,
			ripple: 0.26286230153405304,
			'vue-vapor': 0.2749913336914427,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 4.372288422174728,
			preact: 5.153460348724626,
			solid: 0.8332642741809181,
			svelte: 1.9247284382392802,
			ripple: 2.069055272504656,
			'vue-vapor': 1.0913035243746625,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 11.574044540407595,
			preact: 8.773218010599201,
			solid: 0.9120721275092538,
			svelte: 0.9157380735278229,
			ripple: 0.8960699172507236,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 2.944436375095618,
			preact: 1.8797226890080385,
			solid: 1.964442726546311,
			svelte: 0.9934491420566235,
			ripple: 1.712121184490317,
			'vue-vapor': 1.2320942640293557,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 1.0581319790564925,
			preact: 0.9302265589222476,
			solid: 3.347083394289458,
			ripple: 1.0020450984055045,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 2.3558061709718667,
			preact: 0.32399103827155895,
			solid: 0.5531481061764983,
			svelte: 0.7492757084508144,
			ripple: 0.5563916520118085,
			'vue-vapor': 1.0098483964898681,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.433855427851851,
			preact: 2.293307431875847,
			solid: 1.5634747125695796,
			svelte: 0.9673319686795102,
			ripple: 1.416744926477889,
			'vue-vapor': 0.8763587662323458,
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
