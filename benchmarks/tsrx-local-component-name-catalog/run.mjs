import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = process.env.OCTANE_LOCAL_NAMES_ROOT
	? path.resolve(process.env.OCTANE_LOCAL_NAMES_ROOT)
	: path.resolve(HERE, '../..');
const { prepareRendererBoundaryRegions } = await import(
	pathToFileURL(
		path.join(SOURCE_ROOT, 'packages/octane/src/compiler/compile-renderer-boundaries.js'),
	).href
);
const { parseModule } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'packages/octane/src/compiler/parser.node.js')).href
);

const iterations = Number.parseInt(process.argv[2] ?? '9', 10);
const BOUNDARIES = 1_000;
const HIGH_COMPONENTS = 10_000;
const LOW_COMPONENTS = 1_000;
if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('TSRX local-component-name iterations must be a positive integer');
}

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

function sourceFor(componentCount) {
	const components = Array.from(
		{ length: componentCount },
		(_, index) => `function Item${index}() @{ <view id={${index}} /> }`,
	).join('\n');
	const boundaries = Array.from(
		{ length: BOUNDARIES },
		(_, index) => `<Native><view id={${index}} /></Native>`,
	).join('');
	return `import { Native } from '@scene/bridge';
${components}
export function Scene() @{ <group>${boundaries}</group> }`;
}

function checksum(value) {
	let output = 2_166_136_261;
	for (let index = 0; index < value.length; index++) {
		output = Math.imul(output ^ value.charCodeAt(index), 16_777_619) >>> 0;
	}
	return output;
}

function validateFixture(source, ast, componentCount) {
	const prepared = prepareRendererBoundaryRegions(
		source,
		'/src/LocalNames.tsrx',
		ownerRenderer,
		options,
		ast,
	);
	assert(prepared, 'local-component-name fixture did not prepare');
	assert.equal(prepared.analysis.boundaries.length, BOUNDARIES, 'boundary count changed');
	assert.equal(prepared.universalUnits.length, BOUNDARIES, 'universal unit count changed');
	return {
		boundaries: BOUNDARIES,
		checksum: checksum(JSON.stringify(prepared.universalUnits)),
		components: componentCount + 1,
		sourceBytes: Buffer.byteLength(source),
		universalUnits: prepared.universalUnits.length,
		correctness: 'pass',
	};
}

function measure(source, ast) {
	const started = performance.now();
	prepareRendererBoundaryRegions(source, '/src/LocalNames.tsrx', ownerRenderer, options, ast);
	return performance.now() - started;
}

function repeatMeasurement(measurement, repetitions) {
	let elapsed = 0;
	for (let repetition = 0; repetition < repetitions; repetition++) elapsed += measurement();
	return elapsed / repetitions;
}

const highSource = sourceFor(HIGH_COMPONENTS);
const lowSource = sourceFor(LOW_COMPONENTS);
const highAst = parseModule(highSource, '/src/LocalNames.tsrx');
const lowAst = parseModule(lowSource, '/src/LocalNames.tsrx');
const targets = [
	{
		name: 'components-high',
		measure: () => measure(highSource, highAst),
		meta: validateFixture(highSource, highAst, HIGH_COMPONENTS),
		samples: [],
	},
	{
		name: 'components-low',
		measure: () => repeatMeasurement(() => measure(lowSource, lowAst), 2),
		meta: validateFixture(lowSource, lowAst, LOW_COMPONENTS),
		samples: [],
	},
];

let failure;
try {
	for (let warmup = 0; warmup < 2; warmup++) {
		for (const target of warmup % 2 === 0 ? targets : targets.toReversed()) target.measure();
	}
	for (let iteration = 0; iteration < iterations; iteration++) {
		for (const target of iteration % 2 === 0 ? targets : targets.toReversed()) {
			target.samples.push(target.measure());
		}
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL tsrx-local-component-name-catalog/${failure}`);
}

const rows = targets.map((target) => ({
	name: target.name,
	ops:
		target.samples.length === 0
			? {}
			: { prepare: timingStatForJson(summarizeSamples(target.samples), { p99: true }) },
	meta: { ...target.meta, correctness: failure ? 'fail' : 'pass' },
}));

if (!failure) {
	for (const target of rows) {
		console.log(
			`PASS tsrx-local-component-name-catalog/${target.name}: ` +
				`${target.ops.prepare.score.toFixed(3)}ms`,
		);
	}
}

const payload = {
	suite: 'tsrx-local-component-name-catalog',
	iterations,
	meta: { sourceRoot: SOURCE_ROOT },
	targets: rows,
	...(failure ? { failed: failure } : {}),
};
if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
if (failure) process.exitCode = 1;
