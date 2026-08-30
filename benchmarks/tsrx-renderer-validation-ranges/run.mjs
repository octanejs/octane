import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = process.env.OCTANE_VALIDATION_ROOT
	? path.resolve(process.env.OCTANE_VALIDATION_ROOT)
	: path.resolve(HERE, '../..');
const { compile } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'packages/octane/src/compiler/index.js')).href
);
const { lowerUniversalRendererRegionAst } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'packages/octane/src/compiler/compile-universal.js')).href
);
const { parseModule } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'packages/octane/src/compiler/parser.node.js')).href
);

const iterations = Number.parseInt(process.argv[2] ?? '7', 10);
const FOCUSED_HIGH_RANGES = 3_200;
const FOCUSED_LOW_RANGES = 32;
const PIPELINE_HIGH_COMPONENTS = 1_600;
const PIPELINE_LOW_COMPONENTS = 100;

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('TSRX renderer-validation iterations must be a positive integer');
}

const ownerRenderer = { id: 'dom', module: 'octane', target: 'dom' };
const validation = {
	forbiddenImports: ['browser-only'],
	hostProps: { view: ['id'] },
	textParents: ['view'],
};
const childRenderer = {
	id: 'object',
	module: 'octane/universal',
	target: 'universal',
	text: 'host',
	validation,
};

function focusedSourceFixture(source) {
	const authoredAst = parseModule(source, '/src/Focused.object.tsrx');
	const validationRanges = authoredAst.body.map(({ start, end }) => ({ start, end }));
	const regionAst = parseModule(
		'const __region = <view id={0} />;',
		'/src/FocusedRegion.object.tsrx',
	);
	const regionExpression = regionAst.body[0]?.declarations?.[0]?.init;
	if (!regionExpression) throw new Error('focused renderer-validation region did not parse');
	return { authoredAst, regionExpression, source, validationRanges };
}

function focusedFixture(count) {
	return focusedSourceFixture(
		Array.from(
			{ length: count },
			(_, index) => `const value${index} = <view id={${index}} />;`,
		).join('\n'),
	);
}

function pipelineSource(count) {
	const declarations = Array.from(
		{ length: count },
		(_, index) => `function Item${index}() @{ <view id={${index}} /> }`,
	).join('\n');
	const references = Array.from({ length: count }, (_, index) => `<Item${index} />`).join('');
	return `import { Native } from '@scene/bridge';
${declarations}
export function Scene() @{ <group><Native>${references}</Native></group> }`;
}

function pipelineOptions(withValidation) {
	const inner = {
		id: 'inner',
		module: '@renderers/inner',
		target: 'universal',
		text: 'host',
		...(withValidation ? { validation } : {}),
	};
	const outer = { id: 'outer', module: 'octane', target: 'dom' };
	return {
		mode: 'client',
		hmr: false,
		dev: false,
		autoMemo: true,
		renderer: outer,
		rendererBoundaries: {
			'@scene/bridge': {
				Native: {
					ownerRenderer: 'outer',
					childRenderer: 'inner',
					prop: 'children',
				},
			},
		},
		rendererRegistry: { inner, outer },
	};
}

function mixChecksum(checksum, value) {
	return Math.imul(checksum ^ value, 16_777_619) >>> 0;
}

function checksumString(value) {
	let checksum = 2_166_136_261;
	for (let index = 0; index < value.length; index++) {
		checksum = mixChecksum(checksum, value.charCodeAt(index));
	}
	return checksum;
}

function measureFocused(fixture, renderer = childRenderer) {
	const started = performance.now();
	const lowered = lowerUniversalRendererRegionAst(
		fixture.regionExpression,
		'/src/Focused.object.tsrx',
		ownerRenderer,
		renderer,
		0,
		{
			authoredAst: fixture.authoredAst,
			authoredSource: fixture.source,
			hmr: false,
			validationRanges: fixture.validationRanges,
		},
	);
	const elapsed = performance.now() - started;
	const checksum = mixChecksum(
		mixChecksum(2_166_136_261, lowered.statements.length),
		JSON.stringify(lowered.metadata).length,
	);
	return { checksum, elapsed };
}

function measurePipeline(source, options) {
	const started = performance.now();
	const result = compile(source, '/src/Boundary.native.tsrx', options);
	const elapsed = performance.now() - started;
	assert.equal(result.diagnostics.length, 0, 'renderer-validation fixture emitted diagnostics');
	return {
		checksum: checksumString(result.code),
		elapsed,
		output: result.code,
		outputBytes: Buffer.byteLength(result.code),
	};
}

function repeatMeasurement(measure, repetitions) {
	let checksum;
	let elapsed = 0;
	let output;
	let outputBytes;
	for (let repetition = 0; repetition < repetitions; repetition++) {
		const sample = measure();
		checksum ??= sample.checksum;
		assert.equal(sample.checksum, checksum, 'repeated semantic checksum changed');
		output ??= sample.output;
		elapsed += sample.elapsed;
		outputBytes = sample.outputBytes;
	}
	return { checksum, elapsed: elapsed / repetitions, output, outputBytes };
}

function verifyValidationSentinels() {
	const focusedInvalid = focusedSourceFixture(
		'const selected = <view onClick={() => undefined} />;',
	);
	assert.throws(() => measureFocused(focusedInvalid), {
		message:
			'Octane universal compiler: renderer "object" does not allow static attribute "onClick" on <view>. at /src/Focused.object.tsrx:1:23',
	});

	const pipelineInvalid = `import { Native } from '@scene/bridge';
export function Scene() @{ <group><Native><view onClick={() => undefined} /></Native></group> }`;
	assert.throws(() => compile(pipelineInvalid, '/src/Boundary.native.tsrx', validatedOptions), {
		message:
			'Octane universal compiler: renderer "inner" does not allow static attribute "onClick" on <view>. at /src/Boundary.native.tsrx:2:48',
	});
}

const focusedHigh = focusedFixture(FOCUSED_HIGH_RANGES);
const focusedLow = focusedFixture(FOCUSED_LOW_RANGES);
const pipelineHigh = pipelineSource(PIPELINE_HIGH_COMPONENTS);
const pipelineLow = pipelineSource(PIPELINE_LOW_COMPONENTS);
const validatedOptions = pipelineOptions(true);
const referenceOptions = pipelineOptions(false);
const targets = [
	{
		name: 'focused-high',
		measure: () => measureFocused(focusedHigh),
		meta: { ranges: FOCUSED_HIGH_RANGES, path: 'focused' },
		samples: [],
	},
	{
		name: 'focused-low',
		measure: () => repeatMeasurement(() => measureFocused(focusedLow), 64),
		meta: { compilesPerSample: 64, ranges: FOCUSED_LOW_RANGES, path: 'focused' },
		samples: [],
	},
	{
		name: 'pipeline-validated-high',
		measure: () => measurePipeline(pipelineHigh, validatedOptions),
		meta: { components: PIPELINE_HIGH_COMPONENTS, path: 'compiler', validation: true },
		samples: [],
	},
	{
		name: 'pipeline-reference-high',
		measure: () => measurePipeline(pipelineHigh, referenceOptions),
		meta: { components: PIPELINE_HIGH_COMPONENTS, path: 'compiler', validation: false },
		samples: [],
	},
	{
		name: 'pipeline-validated-low',
		measure: () => repeatMeasurement(() => measurePipeline(pipelineLow, validatedOptions), 4),
		meta: {
			compilesPerSample: 4,
			components: PIPELINE_LOW_COMPONENTS,
			path: 'compiler',
			validation: true,
		},
		samples: [],
	},
	{
		name: 'pipeline-reference-low',
		measure: () => repeatMeasurement(() => measurePipeline(pipelineLow, referenceOptions), 4),
		meta: {
			compilesPerSample: 4,
			components: PIPELINE_LOW_COMPONENTS,
			path: 'compiler',
			validation: false,
		},
		samples: [],
	},
];

let failure;
try {
	verifyValidationSentinels();
	const expectedChecksums = new Map();
	const expectedOutputs = new Map();
	for (const target of targets) {
		const first = target.measure();
		expectedChecksums.set(target.name, first.checksum);
		expectedOutputs.set(target.name, first.output);
		target.meta = {
			...target.meta,
			checksum: expectedChecksums.get(target.name),
			outputBytes: first.outputBytes,
		};
	}
	assert.equal(
		expectedOutputs.get('pipeline-validated-high'),
		expectedOutputs.get('pipeline-reference-high'),
		'high-cardinality validation changed compiler output',
	);
	assert.equal(
		expectedOutputs.get('pipeline-validated-low'),
		expectedOutputs.get('pipeline-reference-low'),
		'low-cardinality validation changed compiler output',
	);
	for (let warmup = 1; warmup < 3; warmup++) {
		for (const target of warmup % 2 === 0 ? targets : targets.toReversed()) {
			const sample = target.measure();
			assert.equal(
				sample.checksum,
				expectedChecksums.get(target.name),
				`${target.name} warmup semantic checksum changed`,
			);
		}
	}

	for (let iteration = 0; iteration < iterations; iteration++) {
		for (const target of iteration % 2 === 0 ? targets : targets.toReversed()) {
			const sample = target.measure();
			assert.equal(
				sample.checksum,
				expectedChecksums.get(target.name),
				`${target.name} semantic checksum changed`,
			);
			target.samples.push(sample.elapsed);
		}
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL tsrx-renderer-validation-ranges/${failure}`);
}

const rows = targets.map((target) => {
	const ops =
		target.samples.length === 0
			? {}
			: { compile: timingStatForJson(summarizeSamples(target.samples), { p99: true }) };
	if (target.samples.length !== 0 && target.meta.ranges) {
		ops.compile_per_1000_ranges = timingStatForJson(
			summarizeSamples(target.samples.map((elapsed) => (elapsed * 1_000) / target.meta.ranges)),
			{ p99: true },
		);
	}
	return {
		name: target.name,
		ops,
		meta: { ...target.meta, correctness: failure ? 'fail' : 'pass' },
	};
});

if (!failure) {
	for (const target of rows) {
		console.log(
			`PASS tsrx-renderer-validation-ranges/${target.name}: ` +
				`${target.ops.compile.score.toFixed(3)}ms`,
		);
	}
	const byName = new Map(rows.map((target) => [target.name, target]));
	const validated = byName.get('pipeline-validated-high').ops.compile.score;
	const reference = byName.get('pipeline-reference-high').ops.compile.score;
	console.log(
		`INFO tsrx-renderer-validation-ranges/validation-share: ` +
			`${(((validated - reference) / validated) * 100).toFixed(1)}%`,
	);
}

const payload = {
	suite: 'tsrx-renderer-validation-ranges',
	iterations,
	meta: { sourceRoot: SOURCE_ROOT },
	targets: rows,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
