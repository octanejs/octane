import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = process.env.OCTANE_GRAPH_ROOT
	? path.resolve(process.env.OCTANE_GRAPH_ROOT)
	: path.resolve(HERE, '../..');
const { compile } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'packages/octane/src/compiler/index.js')).href
);
const COMPONENTS = 2_400;
const iterations = Number.parseInt(process.argv[2] ?? '8', 10);
const options = { mode: 'client', hmr: false, dev: false, autoMemo: true };

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('TSrX component graph iterations must be a positive integer');
}

function sourceFor(reverse, opaqueLeaf) {
	const declarations = Array.from({ length: COMPONENTS }, (_, index) => {
		const body =
			index === COMPONENTS - 1
				? opaqueLeaf
					? '<Opaque />'
					: '{live as string}'
				: `<Component${index + 1} />`;
		return `${index === 0 ? 'export ' : ''}function Component${index}() @{ <div>${body}</div> }`;
	});
	if (reverse) declarations.reverse();
	const imported = opaqueLeaf ? 'Opaque' : 'live';
	return `import { ${imported} } from './live';\n${declarations.join('\n')}`;
}

const variants = [
	{ name: 'dependent-first', source: sourceFor(false, false), samples: [] },
	{ name: 'dependency-first', source: sourceFor(true, false), samples: [] },
	{ name: 'warm-dependent-first', source: sourceFor(false, true), samples: [] },
	{ name: 'warm-dependency-first', source: sourceFor(true, true), samples: [] },
];

function warmPlanCount(code) {
	return code.match(/\b__warm:\s*\(/g)?.length ?? 0;
}

function assertCycleControls() {
	const syncCycle = compile(
		'export function CycleA() @{ <CycleB /> }\nfunction CycleB() @{ <CycleA /> }',
		'synchronous-cycle.tsrx',
		options,
	);
	assert.equal(syncCycle.diagnostics.length, 0, 'synchronous cycle emitted compiler diagnostics');
	assert.equal(warmPlanCount(syncCycle.code), 0, 'synchronous cycle gained a warm plan');

	const seededCycle = compile(
		"import { Opaque } from './opaque';\nexport function CycleA() @{ <><CycleB /><Opaque /></> }\nfunction CycleB() @{ <CycleA /> }",
		'opaque-cycle.tsrx',
		options,
	);
	assert.equal(seededCycle.diagnostics.length, 0, 'opaque cycle emitted compiler diagnostics');
	assert.equal(warmPlanCount(seededCycle.code), 2, 'opaque cycle lost warm reachability');
}

function compileVariant(variant) {
	const started = performance.now();
	const result = compile(variant.source, `${variant.name}.tsrx`, options);
	const elapsed = performance.now() - started;
	const witnesses = result.code.match(/const __memoDep[\w$]* = live;/g)?.length ?? 0;
	const warmPlans = warmPlanCount(result.code);
	const hoistedDeclarations =
		result.code.match(/^(?:export )?function Component\d+\(/gm)?.length ?? 0;
	const dependentFirst = variant.name.endsWith('dependent-first');
	const warm = variant.name.startsWith('warm-');
	const expectedHoistedDeclarations = dependentFirst ? COMPONENTS - 1 : 0;
	assert.equal(result.diagnostics.length, 0, `${variant.name} emitted compiler diagnostics`);
	assert.equal(
		witnesses,
		warm ? 0 : COMPONENTS - 1,
		`${variant.name} did not preserve every transitive live-binding witness`,
	);
	assert.equal(
		warmPlans,
		warm ? COMPONENTS : 0,
		`${variant.name} changed same-module warm-plan reachability`,
	);
	assert.equal(
		hoistedDeclarations,
		expectedHoistedDeclarations,
		`${variant.name} changed its above-declaration component references`,
	);
	variant.meta = {
		components: COMPONENTS,
		callEdges: COMPONENTS - 1,
		liveBindingWitnesses: witnesses,
		warmPlans,
		hoistedDeclarations,
		sourceBytes: Buffer.byteLength(variant.source),
		outputBytes: Buffer.byteLength(result.code),
		correctness: 'pass',
	};
	return elapsed;
}

let failure;
const rows = [];

try {
	assertCycleControls();
	for (let warmup = 0; warmup < 2; warmup++) {
		for (const variant of warmup % 2 === 0 ? variants : variants.toReversed()) {
			compileVariant(variant);
		}
	}

	for (let iteration = 0; iteration < iterations; iteration++) {
		for (const variant of iteration % 2 === 0 ? variants : variants.toReversed()) {
			variant.samples.push(compileVariant(variant));
		}
	}

	for (const variant of variants) {
		const compileStat = timingStatForJson(summarizeSamples(variant.samples), { p99: true });
		rows.push({ name: variant.name, ops: { compile: compileStat }, meta: variant.meta });
		console.log(
			`PASS tsrx-component-graph/${variant.name}: ${compileStat.score.toFixed(3)}ms ` +
				`for ${COMPONENTS} components`,
		);
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL tsrx-component-graph/${failure}`);
}

const payload = {
	suite: 'tsrx-component-graph',
	iterations,
	targets: rows,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
