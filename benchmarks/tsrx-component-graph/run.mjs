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

function sourceFor(reverse) {
	const declarations = Array.from({ length: COMPONENTS }, (_, index) => {
		const body = index === COMPONENTS - 1 ? '{live as string}' : `<Component${index + 1} />`;
		return `${index === 0 ? 'export ' : ''}function Component${index}() @{ <div>${body}</div> }`;
	});
	if (reverse) declarations.reverse();
	return `import { live } from './live';\n${declarations.join('\n')}`;
}

const variants = [
	{ name: 'dependent-first', source: sourceFor(false), samples: [] },
	{ name: 'dependency-first', source: sourceFor(true), samples: [] },
];

function compileVariant(variant) {
	const started = performance.now();
	const result = compile(variant.source, `${variant.name}.tsrx`, options);
	const elapsed = performance.now() - started;
	const witnesses = result.code.match(/const __memoDep[\w$]* = live;/g)?.length ?? 0;
	assert.equal(result.diagnostics.length, 0, `${variant.name} emitted compiler diagnostics`);
	assert.equal(
		witnesses,
		COMPONENTS - 1,
		`${variant.name} did not preserve every transitive live-binding witness`,
	);
	variant.meta = {
		components: COMPONENTS,
		callEdges: COMPONENTS - 1,
		liveBindingWitnesses: witnesses,
		sourceBytes: Buffer.byteLength(variant.source),
		outputBytes: Buffer.byteLength(result.code),
		correctness: 'pass',
	};
	return elapsed;
}

let failure;
const rows = [];

try {
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
