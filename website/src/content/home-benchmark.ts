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
			react: 3.1718163118204847,
			preact: 2.6673510031086445,
			solid: 1.3829086642907042,
			svelte: 2.0607759530027256,
			ripple: 1.3853880771526144,
			'vue-vapor': 0.8629194025039304,
			inferno: 1.4354248700043801,
		},
		{
			op: 'uibench',
			'octane-tsrx': 1,
			react: 2.931901234296744,
			preact: 3.9355628920515437,
			solid: 9.306914732153936,
			ripple: 1.130748771966592,
			'vue-vapor': 0.9377054635657863,
			inferno: 2.4704270300284046,
		},
		{
			op: 'todomvc',
			'octane-tsrx': 1,
			react: 1.829380449630095,
			preact: 1.9472312603142643,
			solid: 1.048818826052103,
			svelte: 0.9864140621405371,
			ripple: 0.6753724528503346,
			'vue-vapor': 0.7330666512293678,
			inferno: 1.0967813194863758,
		},
		{
			op: 'weather-app',
			'octane-tsrx': 1,
			react: 1.3705741184790208,
			preact: 1.3380701955598897,
			solid: 1.2448493038205712,
			svelte: 0.9808356587364957,
			inferno: 1.3712225231777244,
		},
		{
			op: 'weather-app-lighthouse',
			'octane-tsrx': 1,
			react: 1.1142235485415575,
			preact: 0.9459877614362695,
			solid: 0.982371885821227,
			svelte: 0.9614841949558045,
			inferno: 0.9570865617808881,
		},
		{
			op: 'chat-stream',
			'octane-tsrx': 1,
			react: 2.2723835235447183,
			preact: 1.915714216597099,
			solid: 0.9126682816491313,
			svelte: 1.4733682781784898,
			ripple: 0.7870200375247749,
			'vue-vapor': 0.7198556957128891,
			inferno: 1.3081708139024022,
		},
		{
			op: 'svg-dashboard',
			'octane-tsrx': 1,
			react: 0.8954722134121451,
			solid: 1.051110157415344,
			svelte: 0.8473416326541222,
			inferno: 0.6822790296819192,
		},
		{
			op: 'js-framework-reorder',
			'octane-tsrx': 1,
			react: 2.2148377654806244,
			preact: 4.668713834219634,
			solid: 1.1969236698166035,
			svelte: 1.7107077721167478,
			ripple: 1.1814103095091992,
			'vue-vapor': 1.7151394371891764,
			inferno: 1.4364310209663604,
		},
		{
			op: 'dbmon',
			'octane-tsrx': 1,
			react: 1.52484819212681,
			preact: 1.7084096728797094,
			solid: 2.3404425661289134,
			svelte: 1.0413163345329512,
			ripple: 1.0009409662688478,
			'vue-vapor': 0.9236846146734754,
			inferno: 0.9150757157722434,
		},
		{
			op: 'effectful-list',
			'octane-tsrx': 1,
			react: 0.549156105487127,
			preact: 2.5683448952984835,
			solid: 0.4684865428624102,
			svelte: 0.5135454647946478,
			ripple: 0.7329366247863549,
			'vue-vapor': 0.4599924074791713,
			inferno: 0.833786489873262,
		},
		{
			op: 'memo-wall',
			'octane-tsrx': 1,
			react: 2.2986929763900297,
			preact: 10.527124268610219,
			solid: 0.6257127437937542,
			svelte: 1.911865904339304,
			ripple: 3.871084951692535,
			'vue-vapor': 0.5638297138221583,
		},
		{
			op: 'recursive-context',
			'octane-tsrx': 1,
			react: 0.934892774041546,
			preact: 0.83217099991303,
			solid: 0.812722978897095,
			svelte: 1.2787637321911767,
			ripple: 0.4845679778807432,
			'vue-vapor': 0.616654636654816,
			inferno: 0.37993367245134957,
		},
		{
			op: 'spa-navigation',
			'octane-tsrx': 1,
			react: 0.8274317848427352,
			solid: 2.1277259161666153,
			'vue-vapor': 1.2290138764711118,
			inferno: 0.629233628562915,
		},
		{
			op: 'signal-favoring',
			'octane-tsrx': 1,
			react: 4.221846559403165,
			preact: 4.458799234644977,
			solid: 0.8833027976935495,
			svelte: 1.1602077801986077,
			ripple: 0.41808471352827653,
			'vue-vapor': 0.4150942244374518,
			inferno: 2.87192403966152,
		},
		{
			op: 'portal-swarm',
			'octane-tsrx': 1,
			react: 1.8479775105158653,
			preact: 7.639203010569936,
			solid: 0.6946183911908194,
			svelte: 1.9999430223749526,
			ripple: 2.606361213834722,
			'vue-vapor': 0.994158690109704,
			inferno: 3.0658046039979685,
		},
		{
			op: 'async-waterfall',
			'octane-tsrx': 1,
			react: 11.259667879098322,
			preact: 8.67099266545561,
			solid: 0.8923352539882659,
			svelte: 0.9191993431551204,
			ripple: 0.8680731567218984,
			inferno: 0.8832408549083665,
		},
		{
			op: 'news',
			'octane-tsrx': 1,
			react: 2.593244085904469,
			preact: 1.6855105534781931,
			solid: 1.7489060443555235,
			svelte: 0.9351728778202519,
			ripple: 1.4709457031615072,
			'vue-vapor': 1.0721327642717087,
			inferno: 1.0293423682367473,
		},
		{
			op: 'streaming-ssr',
			'octane-tsrx': 1,
			react: 0.8393026456498367,
			preact: 1.3143018990903592,
			solid: 3.3910150863840043,
			ripple: 0.7941846209506154,
			inferno: 1.0091625108708968,
		},
		{
			op: 'bundle-size',
			'octane-tsrx': 1,
			react: 2.19713732227609,
			preact: 0.2967744489152965,
			solid: 0.5066813738270017,
			svelte: 0.6863334450464917,
			ripple: 0.5144467920216055,
			'vue-vapor': 0.9259591503013377,
			inferno: 0.37102505091436533,
		},
		{
			op: 'ssr-throughput',
			'octane-tsrx': 1,
			react: 2.4087002280978074,
			preact: 2.235650856708628,
			solid: 1.494480765273889,
			svelte: 0.9738284037897175,
			ripple: 1.3727564550215359,
			'vue-vapor': 0.8451438561490103,
			inferno: 1.8511429539706643,
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
