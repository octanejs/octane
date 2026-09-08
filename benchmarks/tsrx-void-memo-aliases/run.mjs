import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = process.env.OCTANE_VOID_MEMO_ROOT
	? path.resolve(process.env.OCTANE_VOID_MEMO_ROOT)
	: path.resolve(HERE, '../..');
const compilerRoot = path.join(SOURCE_ROOT, 'packages/octane/src/compiler');
const compilerRequire = createRequire(path.join(compilerRoot, 'index.js'));
const { findVoidComponentExports } = await import(
	pathToFileURL(path.join(compilerRoot, 'bundler.js')).href
);
const { parseModule } = await import(pathToFileURL(compilerRequire.resolve('@tsrx/core')).href);

const COUNTS = [250, 1_000];
const iterations = Number.parseInt(process.argv[2] ?? '9', 10);

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('TSRX void memo alias iterations must be a positive integer');
}

function digest(value) {
	return createHash('sha256').update(value).digest('hex');
}

function sourceFor(count, dependencyFirst) {
	const aliases = Array.from({ length: count }, (_, index) => {
		const target = index === count - 1 ? 'Leaf' : `Memo${index + 1}`;
		return `${index === 0 ? 'export ' : ''}const Memo${index} = cache(${target});`;
	});
	if (dependencyFirst) aliases.reverse();
	return [
		"import { memo as cache } from 'octane';",
		'function Leaf() @{ <div /> }',
		...aliases,
	].join('\n');
}

const variants = COUNTS.flatMap((count) =>
	[false, true].map((dependencyFirst) => {
		const name = `${dependencyFirst ? 'dependency-first' : 'dependent-first'}-${count}`;
		const source = sourceFor(count, dependencyFirst);
		return {
			name,
			count,
			dependencyFirst,
			source,
			ast: parseModule(source, `${name}.tsrx`),
			samples: [],
		};
	}),
);

function classify(variant) {
	const started = performance.now();
	const exports = findVoidComponentExports(variant.ast, `${variant.name}.tsrx`);
	const elapsed = performance.now() - started;
	assert.deepEqual(exports, ['Memo0'], `${variant.name} changed its void export metadata`);
	return elapsed;
}

function assertNegativeControls() {
	const controls = [
		"import { memo } from 'octane';\nfunction Leaf() @{ <div /> }\nexport const App = memo(Leaf, () => true);",
		'const memo = (value) => value;\nfunction Leaf() @{ <div /> }\nexport const App = memo(Leaf);',
		"import { memo } from 'octane';\nfunction Leaf() @{ <div /> }\nexport let App = memo(Leaf);",
	];
	for (const [index, source] of controls.entries()) {
		assert.deepEqual(
			findVoidComponentExports(source, `negative-${index}.tsrx`),
			[],
			`negative control ${index} became a proven void export`,
		);
	}
}

let failure;
const rows = [];

try {
	assertNegativeControls();
	for (let warmup = 0; warmup < 2; warmup++) {
		for (const variant of warmup % 2 === 0 ? variants : variants.toReversed()) classify(variant);
	}
	for (let iteration = 0; iteration < iterations; iteration++) {
		for (const variant of iteration % 2 === 0 ? variants : variants.toReversed()) {
			variant.samples.push(classify(variant));
		}
	}
	for (const variant of variants) {
		const classification = timingStatForJson(summarizeSamples(variant.samples));
		const per100Aliases = timingStatForJson(
			summarizeSamples(variant.samples.map((elapsed) => (elapsed * 100) / variant.count)),
		);
		rows.push({
			name: variant.name,
			ops: {
				classification,
				classification_per_100_aliases: per100Aliases,
			},
			meta: {
				aliases: variant.count,
				dependencyFirst: variant.dependencyFirst,
				exports: ['Memo0'],
				sourceBytes: Buffer.byteLength(variant.source),
				sourceDigest: digest(variant.source),
				correctness: 'pass',
			},
		});
		console.log(
			`PASS tsrx-void-memo-aliases/${variant.name}: ` +
				`${classification.score.toFixed(3)}ms classify, ` +
				`${per100Aliases.score.toFixed(3)}ms per 100 aliases`,
		);
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL tsrx-void-memo-aliases/${failure}`);
}

const payload = {
	suite: 'tsrx-void-memo-aliases',
	iterations,
	targets: rows,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
