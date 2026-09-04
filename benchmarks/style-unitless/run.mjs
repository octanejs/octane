import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cssStyleValue, isUnitlessStyleProp } from '../../packages/octane/src/dom-tables.js';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const iterations = Number.parseInt(process.argv[2] ?? '8', 10);
const LOOKUPS_PER_SAMPLE = 1_000_000;

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('style-unitless iterations must be a positive integer');
}

const UNITLESS_STYLE_PROPS = new Set();
for (const base of [
	'animationIterationCount',
	'aspectRatio',
	'borderImageOutset',
	'borderImageSlice',
	'borderImageWidth',
	'boxFlex',
	'boxFlexGroup',
	'boxOrdinalGroup',
	'columnCount',
	'columns',
	'flex',
	'flexGrow',
	'flexPositive',
	'flexShrink',
	'flexNegative',
	'flexOrder',
	'gridArea',
	'gridRow',
	'gridRowEnd',
	'gridRowSpan',
	'gridRowStart',
	'gridColumn',
	'gridColumnEnd',
	'gridColumnSpan',
	'gridColumnStart',
	'fontWeight',
	'lineClamp',
	'lineHeight',
	'opacity',
	'order',
	'orphans',
	'scale',
	'tabSize',
	'widows',
	'zIndex',
	'zoom',
	'fillOpacity',
	'floodOpacity',
	'stopOpacity',
	'strokeDasharray',
	'strokeDashoffset',
	'strokeMiterlimit',
	'strokeOpacity',
	'strokeWidth',
]) {
	const canonical = base.toLowerCase();
	UNITLESS_STYLE_PROPS.add(canonical);
	UNITLESS_STYLE_PROPS.add('webkit' + canonical);
	UNITLESS_STYLE_PROPS.add('ms' + canonical);
	UNITLESS_STYLE_PROPS.add('moz' + canonical);
	UNITLESS_STYLE_PROPS.add('o' + canonical);
}

function isUnitlessScan(name) {
	return UNITLESS_STYLE_PROPS.has(name.replaceAll('-', '').toLowerCase());
}

function cssStyleValueScan(name, value) {
	if (
		typeof value === 'number' &&
		value !== 0 &&
		name.charCodeAt(0) !== 45 &&
		!isUnitlessScan(name)
	) {
		return value + 'px';
	}
	return typeof value === 'string' ? value.trim() : '' + value;
}

const keys = [
	'width',
	'height',
	'fontSize',
	'marginTop',
	'opacity',
	'zIndex',
	'lineHeight',
	'line-height',
	'flexGrow',
	'WebkitLineClamp',
	'paddingLeft',
	'--gap',
];
const values = [100, 48, 14, 8, 0.5, 3, 1.4, 2, 2, 3, 16, 8];

function expectedCss(name, value) {
	return cssStyleValueScan(name, value);
}

function runLookups(serialize, names, nums, count) {
	const started = performance.now();
	let checksum = 0;
	for (let n = 0; n < count; n++) {
		for (let i = 0; i < names.length; i++) {
			const css = serialize(names[i], nums[i]);
			checksum += css.length;
		}
	}
	return { elapsed: performance.now() - started, checksum };
}

const scenarios = [
	{
		name: 'scan-mixed',
		serialize: cssStyleValueScan,
		names: keys,
		nums: values,
	},
	{
		name: 'cached-mixed',
		serialize: cssStyleValue,
		names: keys,
		nums: values,
	},
];

for (let i = 0; i < keys.length; i++) {
	assert.equal(
		isUnitlessStyleProp(keys[i]),
		isUnitlessScan(keys[i]),
		keys[i] + ' unitless classification drifted',
	);
	assert.equal(cssStyleValue(keys[i], values[i]), expectedCss(keys[i], values[i]), keys[i]);
}
assert.equal(cssStyleValue('fontSize', 12), '12px', 'fontSize lost px');
assert.equal(cssStyleValue('opacity', 0.5), '0.5', 'opacity gained px');
assert.equal(cssStyleValue('line-height', 2), '2', 'kebab line-height gained px');
assert.equal(cssStyleValue('WebkitLineClamp', 3), '3', 'vendor line-clamp gained px');
assert.equal(cssStyleValue('--gap', 8), '8', 'custom property gained px');

const WARMUP_LOOKUPS = 200;
const expectedChecksums = new Map();
for (const scenario of scenarios) {
	const warmup = runLookups(scenario.serialize, scenario.names, scenario.nums, WARMUP_LOOKUPS);
	const control = runLookups(cssStyleValueScan, scenario.names, scenario.nums, WARMUP_LOOKUPS);
	assert.equal(warmup.checksum, control.checksum, scenario.name + ' warmup drifted');
	assert.equal(warmup.checksum % WARMUP_LOOKUPS, 0, scenario.name + ' warmup checksum not uniform');
	expectedChecksums.set(scenario.name, warmup.checksum / WARMUP_LOOKUPS);
}

const samples = new Map();
for (const scenario of scenarios) samples.set(scenario.name, []);

for (let iteration = 0; iteration < iterations; iteration++) {
	const order = iteration % 2 === 0 ? scenarios : scenarios.slice().reverse();
	for (const scenario of order) {
		const sample = runLookups(
			scenario.serialize,
			scenario.names,
			scenario.nums,
			LOOKUPS_PER_SAMPLE,
		);
		assert.equal(
			sample.checksum,
			expectedChecksums.get(scenario.name) * LOOKUPS_PER_SAMPLE,
			scenario.name + ' timed checksum drifted',
		);
		samples.get(scenario.name).push((sample.elapsed * 1_000) / LOOKUPS_PER_SAMPLE);
	}
}

const rows = scenarios.map(function (scenario) {
	const summary = summarizeSamples(samples.get(scenario.name));
	console.log(
		'PASS style-unitless/' + scenario.name + ': ' + summary.score.toFixed(3) + 'ms/1,000 lookups',
	);
	return {
		name: scenario.name,
		ops: { lookup_per_1000: timingStatForJson(summary) },
		meta: {
			keys: scenario.names.length,
			lookupsPerSample: LOOKUPS_PER_SAMPLE * scenario.names.length,
			correctness: 'pass',
		},
	};
});

const payload = {
	suite: 'style-unitless',
	iterations,
	targets: rows,
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}
