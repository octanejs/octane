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
	title: 'Every suite, normalized',
	description:
		'Geometric mean of per-operation benchmark scores, relative to Octane. Lower is better.',
	series: SUMMARY_SERIES,
	rows: [
		{
			op: 'js-framework',
			'octane-tsrx': 1,
			react: 2.638476513470999,
			preact: 2.465063603778609,
			solid: 1.1034246057346453,
			svelte: 1.7081736428319363,
			ripple: 1.1000965710727728,
			'vue-vapor': 1.0006065498931602,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 3.775843050546698,
			preact: 4.254925544483783,
			solid: 1.8242964756691702,
			svelte: 1.3025900039570693,
			ripple: 1.1922017977593637,
			'vue-vapor': 1.529131557776048,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 3.103352169148047,
			preact: 3.925550907312265,
			solid: 1.1502652290705133,
			svelte: 1.5881463262189783,
			ripple: 1.180637656045611,
			'vue-vapor': 0.9047709913228571,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.873567113713346,
			preact: 6.294075911033476,
			solid: 1.662699267217151,
			svelte: 2.238030127767983,
			ripple: 1.5618949257503176,
			'vue-vapor': 2.101208701819501,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.9861638689547045,
			preact: 2.5292434157627492,
			solid: 2.6411925402039573,
			svelte: 1.3177465470402894,
			ripple: 1.273712017495525,
			'vue-vapor': 1.1574821783555265,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 2.354245326068542,
			preact: 5.127593543436272,
			solid: 0.6946315525721587,
			svelte: 0.8596431896063168,
			ripple: 1.1217605808389748,
			'vue-vapor': 0.8995496824493224,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 4.875128928835251,
			preact: 6.225394162055643,
			solid: 0.2894263405066609,
			svelte: 1.024572971131265,
			ripple: 2.444735865955871,
			'vue-vapor': 0.2857193612481236,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.579140602480428,
			preact: 1.6475929608212019,
			solid: 1.0940719862811685,
			svelte: 2.223083684016549,
			ripple: 1.0620499784478001,
			'vue-vapor': 1.0158786278279055,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 7.40016992337849,
			preact: 6.316812937679984,
			solid: 0.7553507994945552,
			svelte: 1.0919247403492898,
			ripple: 0.3298102614161704,
			'vue-vapor': 0.3982495677331262,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 1.2311853981691683,
			preact: 1.3834504963517578,
			solid: 0.46512882844164016,
			svelte: 1.2985599726380654,
			ripple: 0.8247197191741089,
			'vue-vapor': 0.9552103357273674,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 12.323339460972882,
			preact: 9.354838868712097,
			solid: 0.9615611182974193,
			svelte: 0.9631436220635455,
			ripple: 0.944777199084522,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 1.4996697478122107,
			preact: 1.1902014119730424,
			solid: 0.932768262077367,
			svelte: 0.5136015900919331,
			ripple: 0.4864694857826731,
			'vue-vapor': 0.6252071657374646,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 1.4131065295900815,
			preact: 1.324327364877235,
			solid: 4.513390573982908,
			ripple: 1.257568386372009,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 0.9852078422399765,
			preact: 0.596995840973518,
			solid: 0.7280215010683541,
			svelte: 0.8453116527579267,
			ripple: 0.8020073078434931,
			'vue-vapor': 0.7353935815388369,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 3.0682659634581966,
			preact: 2.845113414933771,
			solid: 1.9402758649449858,
			svelte: 1.2165674941247773,
			ripple: 1.0837830908022226,
			'vue-vapor': 1.1116467153973832,
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
