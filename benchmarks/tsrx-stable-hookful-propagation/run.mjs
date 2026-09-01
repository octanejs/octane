import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = process.env.OCTANE_STABLE_HOOKFUL_ROOT
	? path.resolve(process.env.OCTANE_STABLE_HOOKFUL_ROOT)
	: path.resolve(HERE, '../..');
const { compile } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'packages/octane/src/compiler/index.js')).href
);

const HIGH_COMPONENTS = 1_000;
const LOW_COMPONENTS = 40;
const LOW_SAMPLE_BATCH = 10;
const args = process.argv.slice(2);
const positional = args.filter((argument) => !argument.startsWith('--'));
const flags = new Set(args.filter((argument) => argument.startsWith('--')));
const iterations = Number.parseInt(positional[0] ?? '7', 10);
const includeRawSamples = flags.has('--raw-samples');
const unknownFlags = [...flags].filter((flag) => flag !== '--raw-samples');

if (positional.length > 1 || unknownFlags.length > 0) {
	throw new Error(`Unknown stable-hookful arguments: ${[...positional.slice(1), ...unknownFlags]}`);
}
if (
	!Number.isSafeInteger(iterations) ||
	iterations < 1 ||
	(positional[0] !== undefined && String(iterations) !== positional[0])
) {
	throw new Error('Stable-hookful iterations must be a positive integer');
}

const options = { mode: 'client', hmr: false, dev: false, autoMemo: true };

function chainSource(components, reverse) {
	const declarations = Array.from({ length: components }, (_, index) => {
		if (index === components - 1) {
			return `function StableNode${index}() @{
	const [value, setValue] = useState(0);
	leafSetter = setValue;
	<span>{live + value as string}</span>
}`;
		}
		return `function StableNode${index}() @{ <div><StableNode${index + 1} /></div> }`;
	});
	if (reverse) declarations.reverse();
	return `import { useState } from 'octane';
import { live } from './live';
let leafSetter = null;
${declarations.join('\n')}
function StableProbe() @{
	const [tick, setTick] = useState(0);
	<section data-stable-hookful><StableNode0 /></section>
}
export function App() @{ <StableProbe /> }`;
}

function outputHash(code) {
	return createHash('sha256').update(code).digest('hex');
}

function publicationWitnessCount(code, name) {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return code.match(new RegExp(`!== ${escaped}\\b`, 'g'))?.length ?? 0;
}

function analyzeOutput(code, publicationNames) {
	return {
		memoDependencies: code.match(/const __memoDep[\w$]* = live;/g)?.length ?? 0,
		publicationWitnesses: publicationNames.reduce(
			(count, name) => count + publicationWitnessCount(code, name),
			0,
		),
	};
}

function compileChecked(source, filename, expected) {
	const result = compile(source, filename, options);
	assert.equal(result.diagnostics.length, 0, `${filename} emitted compiler diagnostics`);
	const analysis = analyzeOutput(result.code, expected.publicationNames);
	assert.equal(
		analysis.memoDependencies,
		expected.memoDependencies,
		`${filename} changed the transitive capture witness count`,
	);
	assert.equal(
		analysis.publicationWitnesses,
		expected.publicationWitnesses,
		`${filename} changed the transitive setter-publication witness count`,
	);
	return { analysis, code: result.code, hash: outputHash(result.code) };
}

function probeSource(body, declarations, privateLets = 'let leafSetter = null;') {
	return `import { useState } from 'octane';
import { live } from './live';
${privateLets}
${declarations}
function StableProbe() @{
	const [tick, setTick] = useState(0);
	<section data-control><${body} /></section>
}
export function App() @{ <StableProbe /> }`;
}

function publicationBoundarySource(publications) {
	const lets = Array.from({ length: publications }, (_, index) => `setter${index} = null`).join(
		', ',
	);
	const leaves = Array.from(
		{ length: publications },
		(_, index) => `function PublicationLeaf${index}() @{
	const [value, setValue] = useState(0);
	setter${index} = setValue;
	<span>{live + value as string}</span>
}`,
	).join('\n');
	const calls = Array.from(
		{ length: publications },
		(_, index) => `<PublicationLeaf${index} />`,
	).join('');
	return probeSource(
		'PublicationParent',
		`${leaves}\nfunction PublicationParent() @{ <>${calls}</> }`,
		`let ${lets};`,
	);
}

function assertSemanticControls() {
	const controls = [
		{
			name: 'transitive-chain',
			source: probeSource(
				'StableParent',
				`function StableLeaf() @{
	const [value, setValue] = useState(0);
	leafSetter = setValue;
	<span>{live + value as string}</span>
}
function StableParent() @{ <StableLeaf /> }`,
			),
			expected: {
				memoDependencies: 1,
				publicationNames: ['leafSetter'],
				publicationWitnesses: 1,
			},
		},
		{
			name: 'missing-dependency',
			source: probeSource(
				'MissingParent',
				`function MissingSeed() @{ <MissingLeaf /> }
function MissingParent() @{ <><MissingSeed /><span>{live as string}</span></> }`,
			),
			expected: {
				memoDependencies: 0,
				publicationNames: ['leafSetter'],
				publicationWitnesses: 0,
			},
		},
		{
			name: 'safe-cycle',
			source: probeSource(
				'CycleB',
				`function CycleA() @{
	const [value, setValue] = useState(0);
	leafSetter = setValue;
	<><CycleB /><span>{live + value as string}</span></>
}
function CycleB() @{ <CycleA /> }`,
			),
			expected: {
				memoDependencies: 2,
				publicationNames: ['leafSetter'],
				publicationWitnesses: 2,
			},
		},
		{
			name: 'repeated-edges',
			source: probeSource(
				'RepeatedParent',
				`function RepeatedLeaf() @{
	const [value, setValue] = useState(0);
	leafSetter = setValue;
	<span>{live + value as string}</span>
}
function RepeatedParent() @{ <><RepeatedLeaf /><RepeatedLeaf /><RepeatedLeaf /></> }`,
			),
			expected: {
				memoDependencies: 1,
				publicationNames: ['leafSetter'],
				publicationWitnesses: 1,
			},
		},
		{
			name: 'publication-boundary-16',
			source: publicationBoundarySource(16),
			expected: {
				memoDependencies: 1,
				publicationNames: Array.from({ length: 16 }, (_, index) => `setter${index}`),
				publicationWitnesses: 16,
			},
		},
		{
			name: 'publication-boundary-17',
			source: publicationBoundarySource(17),
			expected: {
				memoDependencies: 0,
				publicationNames: Array.from({ length: 17 }, (_, index) => `setter${index}`),
				publicationWitnesses: 0,
			},
		},
	];

	return controls.map((control) => {
		const result = compileChecked(control.source, `${control.name}.control.tsrx`, control.expected);
		return {
			name: control.name,
			...result.analysis,
			outputHash: result.hash,
			correctness: 'pass',
		};
	});
}

const variants = [
	{
		name: `dependent-first-high-${HIGH_COMPONENTS}`,
		components: HIGH_COMPONENTS,
		source: chainSource(HIGH_COMPONENTS, false),
		samples: [],
	},
	{
		name: `dependency-first-high-${HIGH_COMPONENTS}`,
		components: HIGH_COMPONENTS,
		source: chainSource(HIGH_COMPONENTS, true),
		samples: [],
	},
	{
		name: `dependent-first-low-${LOW_COMPONENTS}`,
		components: LOW_COMPONENTS,
		source: chainSource(LOW_COMPONENTS, false),
		samples: [],
	},
	{
		name: `dependency-first-low-${LOW_COMPONENTS}`,
		components: LOW_COMPONENTS,
		source: chainSource(LOW_COMPONENTS, true),
		samples: [],
	},
];

function measureVariant(variant) {
	const batchSize = variant.components === LOW_COMPONENTS ? LOW_SAMPLE_BATCH : 1;
	let result;
	const started = performance.now();
	for (let index = 0; index < batchSize; index++) {
		result = compile(variant.source, `${variant.name}.tsrx`, options);
	}
	const elapsed = (performance.now() - started) / batchSize;
	assert.equal(result.diagnostics.length, 0, `${variant.name} emitted compiler diagnostics`);
	const analysis = analyzeOutput(result.code, ['leafSetter']);
	assert.deepEqual(
		analysis,
		{ memoDependencies: 1, publicationWitnesses: 1 },
		`${variant.name} changed stable-hookful propagation semantics`,
	);
	return {
		analysis,
		elapsed,
		hash: outputHash(result.code),
		outputBytes: Buffer.byteLength(result.code),
	};
}

let failure;
let semanticControls = [];

try {
	semanticControls = assertSemanticControls();
	for (const variant of variants) {
		const first = measureVariant(variant);
		variant.expectedHash = first.hash;
		variant.meta = {
			...first.analysis,
			batchSize: variant.components === LOW_COMPONENTS ? LOW_SAMPLE_BATCH : 1,
			components: variant.components,
			callEdges: variant.components - 1,
			outputBytes: first.outputBytes,
			outputHash: first.hash,
			sourceBytes: Buffer.byteLength(variant.source),
			correctness: 'pass',
		};
	}
	for (let warmup = 0; warmup < 2; warmup++) {
		for (const variant of warmup % 2 === 0 ? variants : variants.toReversed()) {
			assert.equal(measureVariant(variant).hash, variant.expectedHash);
		}
	}
	for (let iteration = 0; iteration < iterations; iteration++) {
		for (const variant of iteration % 2 === 0 ? variants : variants.toReversed()) {
			const sample = measureVariant(variant);
			assert.equal(sample.hash, variant.expectedHash, `${variant.name} output hash changed`);
			variant.samples.push(sample.elapsed);
		}
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL tsrx-stable-hookful-propagation/${failure}`);
}

const targets = variants.map((variant) => ({
	name: variant.name,
	ops:
		variant.samples.length === 0
			? {}
			: {
					compile: timingStatForJson(summarizeSamples(variant.samples), { p99: true }),
					compile_per_100_components: timingStatForJson(
						summarizeSamples(variant.samples.map((sample) => (sample * 100) / variant.components)),
						{ p99: true },
					),
				},
	meta: variant.meta ?? { correctness: 'fail' },
	...(includeRawSamples ? { rawSamples: { compile: variant.samples } } : {}),
}));

if (!failure) {
	for (const target of targets) {
		console.log(
			`PASS tsrx-stable-hookful-propagation/${target.name}: ` +
				`${target.ops.compile.score.toFixed(3)}ms`,
		);
	}
}

const payload = {
	suite: 'tsrx-stable-hookful-propagation',
	iterations,
	meta: { sourceRoot: SOURCE_ROOT },
	targets,
	semanticControls,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
