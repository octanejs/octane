import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BOUNDARIES = 1_000;
const HIGH_COMPONENTS = 10_000;
const LOW_COMPONENTS = 1_000;
const ownerRenderer = { id: 'dom', module: 'octane', target: 'dom' };
const childRenderer = {
	id: 'inner',
	module: '@renderers/inner',
	target: 'universal',
	text: 'host',
};
const rendererBoundaries = {
	'@scene/bridge': {
		Native: { ownerRenderer: 'dom', childRenderer: 'inner', prop: 'children' },
	},
};
const options = {
	autoMemo: true,
	dev: false,
	hmr: false,
	mode: 'client',
	renderer: ownerRenderer,
	rendererBoundaries,
	rendererRegistry: { inner: childRenderer },
};

function sourceFor(componentCount, boundaryCount = BOUNDARIES) {
	const components = Array.from(
		{ length: componentCount },
		(_, index) => `function Item${index}() @{ <view id={${index}} /> }`,
	).join('\n');
	const boundaries = Array.from(
		{ length: boundaryCount },
		(_, index) => `<Native><view id={${index}} /></Native>`,
	).join('');
	return `import { Native } from '@scene/bridge';\n${components}\nexport function Scene() @{ <group>${boundaries}</group> }`;
}

async function load(root) {
	const compilerRoot = path.join(root, 'packages/octane/src/compiler');
	const [{ prepareRendererBoundaryRegions }, { compile }, { parseModule }] = await Promise.all([
		import(pathToFileURL(path.join(compilerRoot, 'compile-renderer-boundaries.js')).href),
		import(pathToFileURL(path.join(compilerRoot, 'index.js')).href),
		import(pathToFileURL(path.join(compilerRoot, 'parser.node.js')).href),
	]);
	return { compile, parseModule, prepareRendererBoundaryRegions };
}

function measure(compiler, source, ast) {
	const started = performance.now();
	compiler.prepareRendererBoundaryRegions(
		source,
		'/src/LocalNames.tsrx',
		ownerRenderer,
		options,
		ast,
	);
	return performance.now() - started;
}

function percentile(values, fraction) {
	const sorted = values.toSorted((left, right) => left - right);
	return sorted[Math.floor((sorted.length - 1) * fraction)];
}

const baselineRoot = process.argv[2];
const candidateRoot = process.argv[3];
const iterations = Number.parseInt(process.argv[4] ?? '9', 10);
if (!baselineRoot || !candidateRoot) {
	throw new Error('usage: node compare.mjs <baseline-root> <candidate-root> [iterations]');
}
if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('comparison iterations must be a positive integer');
}

const [baseline, candidate] = await Promise.all([
	load(path.resolve(baselineRoot)),
	load(path.resolve(candidateRoot)),
]);
const sources = { high: sourceFor(HIGH_COMPONENTS), low: sourceFor(LOW_COMPONENTS) };
const asts = {
	baseline: {
		high: baseline.parseModule(sources.high, '/src/high.baseline.tsrx'),
		low: baseline.parseModule(sources.low, '/src/low.baseline.tsrx'),
	},
	candidate: {
		high: candidate.parseModule(sources.high, '/src/high.candidate.tsrx'),
		low: candidate.parseModule(sources.low, '/src/low.candidate.tsrx'),
	},
};
const outputControl = sourceFor(100, 50);
const before = baseline.compile(outputControl, '/src/output.baseline.tsrx', options);
const after = candidate.compile(outputControl, '/src/output.candidate.tsrx', options);
assert.equal(before.diagnostics.length, 0, 'baseline output control emitted diagnostics');
assert.equal(after.diagnostics.length, 0, 'candidate output control emitted diagnostics');
assert.equal(after.code, before.code, 'candidate changed compiler output');

for (const [name, compiler] of [
	['baseline', baseline],
	['candidate', candidate],
]) {
	measure(compiler, sources.high, asts[name].high);
	measure(compiler, sources.low, asts[name].low);
}

const samples = {
	baseline: { high: [], low: [] },
	candidate: { high: [], low: [] },
};
for (let iteration = 0; iteration < iterations; iteration++) {
	const order =
		iteration % 2 === 0
			? [
					['baseline', baseline],
					['candidate', candidate],
				]
			: [
					['candidate', candidate],
					['baseline', baseline],
				];
	for (const [name, compiler] of order) {
		samples[name].high.push(measure(compiler, sources.high, asts[name].high));
		samples[name].low.push(measure(compiler, sources.low, asts[name].low));
	}
}

const highRatios = samples.baseline.high.map(
	(value, index) => value / samples.candidate.high[index],
);
const highDeltas = samples.baseline.high.map(
	(value, index) => value - samples.candidate.high[index],
);
const lowRatios = samples.candidate.low.map((value, index) => value / samples.baseline.low[index]);
const result = {
	high: {
		conservativeDelta: percentile(highDeltas, 0.2),
		conservativeRatio: percentile(highRatios, 0.2),
		medianDelta: percentile(highDeltas, 0.5),
		medianRatio: percentile(highRatios, 0.5),
	},
	lowConservativeRatio: percentile(lowRatios, 0.8),
};
result.gates = {
	highAbsolute: result.high.conservativeDelta >= 50,
	highRatio: result.high.conservativeRatio >= 1.1,
	lowCardinality: result.lowConservativeRatio <= 1.1,
};
result.pass = Object.values(result.gates).every(Boolean);
console.log(JSON.stringify(result, null, '\t'));
if (!result.pass) process.exitCode = 1;
