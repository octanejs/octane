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
			react: 3.8002645156973163,
			preact: 3.357292807499248,
			solid: 1.4312667199578457,
			svelte: 2.039244034565408,
			ripple: 0.8131164588549871,
			'vue-vapor': 1.0124281205598127,
			inferno: 1.012590355592666,
		},
		{
			op: 'uibench',
			'octane-tsrx': 1,
			react: 2.772756867032174,
			preact: 5.039620394746685,
			solid: 13.429179636924193,
			ripple: 0.6981988619585048,
			'vue-vapor': 0.8489920460536398,
			inferno: 1.8778752542518375,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 2.837711372274912,
			preact: 2.9122627200213973,
			solid: 1.4944619047975056,
			svelte: 1.3101741424779092,
			ripple: 0.734997769877666,
			'vue-vapor': 0.765422987737245,
			inferno: 1.354276305300394,
		},
		{
			op: 'weather-app',
			'octane-tsrx': 1,
			react: 1.316060555581502,
			preact: 1.3399954626110686,
			solid: 1.1588312867144703,
			svelte: 0.966776137934575,
			inferno: 1.4165087368461986,
		},
		{
			op: 'weather-app-lighthouse',
			'octane-tsrx': 1,
			react: 0.9380213398585745,
			preact: 0.7690017972221874,
			solid: 0.8064380973445606,
			svelte: 0.8633181575684981,
			inferno: 0.7860306959528105,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 1.685957993069109,
			preact: 1.9739314041479328,
			solid: 1.3361287729255062,
			svelte: 1.5782000152301878,
			ripple: 0.6281062572716059,
			'vue-vapor': 0.595511190403552,
			inferno: 0.8266910639098404,
		},
		{
			op: 'svg-dashboard',
			'octane-tsrx': 1,
			react: 0.993360297808768,
			solid: 1.2834002745420818,
			svelte: 1.176692077788296,
			inferno: 0.7724173539607151,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.265380144177314,
			preact: 5.1515381655103525,
			solid: 0.9108982969075481,
			svelte: 1.5167384812655387,
			ripple: 0.6968933847957983,
			'vue-vapor': 0.85006416169631,
			inferno: 1.43573127545916,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.5521709944076898,
			preact: 2.7020094227622096,
			solid: 2.4040484125226,
			svelte: 1.465068402611533,
			ripple: 0.9904973746833989,
			'vue-vapor': 0.9754515615514395,
			inferno: 1.1964294405300246,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 0.6075892911993761,
			preact: 3.2077515178766323,
			solid: 0.5308983705958529,
			svelte: 0.5661356869167296,
			ripple: 0.353676923147122,
			'vue-vapor': 0.5595619483653412,
			inferno: 0.7043016236416757,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 2.1735494428424658,
			preact: 10.770841269556723,
			solid: 0.7438228888745197,
			svelte: 2.1221509705591286,
			ripple: 0.30345013751202216,
			'vue-vapor': 0.607951587824018,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 1.1448117195815575,
			preact: 0.8745688410908059,
			solid: 0.8807095630272982,
			svelte: 1.287719447847492,
			ripple: 0.31422057712770557,
			'vue-vapor': 0.8920374783471473,
			inferno: 0.2897190773659237,
		},
		{
			op: 'spa-navigation',
			'octane-tsrx': 1,
			react: 0.9828625776503677,
			solid: 2.358201747325596,
			'vue-vapor': 1.8966630310395156,
			inferno: 0.7049603661793833,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 5.165594149189074,
			preact: 6.717788175816044,
			solid: 0.82039170088696,
			svelte: 0.9322798005298418,
			ripple: 0.43895135319289985,
			'vue-vapor': 0.5127130859122309,
			inferno: 3.798543790134424,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 1.3210938536688608,
			preact: 5.775776108830357,
			solid: 0.5594039559013062,
			svelte: 1.4285647913777164,
			ripple: 0.30636735011788707,
			'vue-vapor': 0.7643311636174135,
			inferno: 1.3414462494368173,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 10.726665595169468,
			preact: 7.887696063998974,
			solid: 0.8792013622231033,
			svelte: 0.8225946648683896,
			ripple: 0.8220606626915031,
			inferno: 0.8055404131800477,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 1.9187704927801381,
			preact: 1.4164431295493511,
			solid: 1.077612242062537,
			svelte: 0.6553291724142309,
			ripple: 0.7288807442422363,
			'vue-vapor': 0.8227195541541179,
			inferno: 0.7862416950490044,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 1.0761176075351033,
			preact: 1.15901728575342,
			solid: 1.8090317438331385,
			ripple: 0.9644479564629544,
			inferno: 1.2881382434431825,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 1.6203628184307166,
			preact: 0.21731227512460327,
			solid: 0.42611182799989605,
			svelte: 0.43813771470684487,
			ripple: 0.4205161339571263,
			'vue-vapor': 0.6039324748038255,
			inferno: 0.2730243976919936,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.550437781704694,
			preact: 2.3555998660412887,
			solid: 1.4598425631183518,
			svelte: 0.8290326387709069,
			ripple: 1.1509532487135818,
			'vue-vapor': 0.8785228116325288,
			inferno: 1.4978058651144104,
		},
	],
	iterations: 0,
	format: 'x',
	ceilings: {
		'bundle-size': {
			'octane-tsrx': 4.559870489088269,
			preact: 0.3228767925547798,
			solid: 1.390890017239467,
			svelte: 0.9171666247011581,
			ripple: 0.8048586660485674,
			'vue-vapor': 2.4717629847773828,
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
