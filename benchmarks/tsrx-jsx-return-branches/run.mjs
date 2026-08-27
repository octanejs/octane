import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = process.env.OCTANE_JSX_RETURN_ROOT
	? path.resolve(process.env.OCTANE_JSX_RETURN_ROOT)
	: path.resolve(HERE, '../..');
const { compile } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'packages/octane/src/compiler/index.js')).href
);
const { findVoidComponentExports } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'packages/octane/src/compiler/bundler.js')).href
);

const COUNTS = [120, 480];
const iterations = Number.parseInt(process.argv[2] ?? '7', 10);

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('TSRX JSX return branch iterations must be a positive integer');
}

function sourceFor(count, eligible) {
	return Array.from({ length: count }, (_, index) => {
		const fallbackTag = eligible ? 'span' : 'div';
		return (
			`export function Branch${index}(props) {\n` +
			`\tif (props.flip) return <div className="a" data-index={${index}}>yes</div>;\n` +
			`\treturn <${fallbackTag} className="b" data-index={${index}}>no</${fallbackTag}>;\n` +
			`}\n`
		);
	}).join('\n');
}

const variants = [
	...COUNTS.map((count) => ({
		name: `eligible-${count}`,
		count,
		eligible: true,
		source: sourceFor(count, true),
		samples: { client: [], server: [], bundler: [] },
	})),
	{
		name: `ineligible-${COUNTS.at(-1)}`,
		count: COUNTS.at(-1),
		eligible: false,
		source: sourceFor(COUNTS.at(-1), false),
		samples: { client: [], server: [], bundler: [] },
	},
];

function compileVariant(variant, mode) {
	const started = performance.now();
	const result = compile(variant.source, `${variant.name}.tsrx`, {
		mode,
		hmr: false,
		dev: false,
	});
	const elapsed = performance.now() - started;
	const loweringPattern = mode === 'client' ? /_\$ifBlock\(/g : /_\$ssrControl\(/g;
	const lowerings = result.code.match(loweringPattern)?.length ?? 0;
	const expectedLowerings = variant.eligible ? variant.count : 0;
	assert.equal(result.diagnostics.length, 0, `${variant.name}/${mode} emitted diagnostics`);
	assert.equal(
		lowerings,
		expectedLowerings,
		`${variant.name}/${mode} changed conditional-return lowering`,
	);
	variant.meta ??= {};
	variant.meta[`${mode}OutputBytes`] = Buffer.byteLength(result.code);
	variant.meta[`${mode}Lowerings`] = lowerings;
	return elapsed;
}

function classifyVariant(variant) {
	const started = performance.now();
	const exports = findVoidComponentExports(variant.source, `${variant.name}.tsrx`);
	const elapsed = performance.now() - started;
	const expected = variant.eligible
		? Array.from({ length: variant.count }, (_, index) => `Branch${index}`)
		: [];
	assert.deepEqual(exports, expected, `${variant.name} changed bundler void-export classification`);
	variant.meta ??= {};
	variant.meta.voidExports = exports.length;
	return elapsed;
}

function measureVariant(variant) {
	return {
		client: compileVariant(variant, 'client'),
		server: compileVariant(variant, 'server'),
		bundler: classifyVariant(variant),
	};
}

const rows = [];
let failure;

try {
	for (let warmup = 0; warmup < 2; warmup++) {
		for (const variant of warmup % 2 === 0 ? variants : variants.toReversed()) {
			measureVariant(variant);
		}
	}

	for (let iteration = 0; iteration < iterations; iteration++) {
		for (const variant of iteration % 2 === 0 ? variants : variants.toReversed()) {
			const sample = measureVariant(variant);
			for (const mode of ['client', 'server', 'bundler']) {
				variant.samples[mode].push(sample[mode]);
			}
		}
	}

	for (const variant of variants) {
		const ops = {};
		for (const mode of ['client', 'server', 'bundler']) {
			const raw = variant.samples[mode];
			const op = mode === 'bundler' ? 'bundler_classify' : `${mode}_compile`;
			ops[op] = timingStatForJson(summarizeSamples(raw));
			ops[`${op}_per_100_components`] = timingStatForJson(
				summarizeSamples(raw.map((elapsed) => (elapsed * 100) / variant.count)),
			);
		}
		rows.push({
			name: variant.name,
			ops,
			meta: {
				components: variant.count,
				eligible: variant.eligible,
				sourceBytes: Buffer.byteLength(variant.source),
				correctness: 'pass',
				...variant.meta,
			},
		});
		console.log(
			`PASS tsrx-jsx-return-branches/${variant.name}: ` +
				`${ops.client_compile.score.toFixed(3)}ms client, ` +
				`${ops.server_compile.score.toFixed(3)}ms server, ` +
				`${ops.bundler_classify.score.toFixed(3)}ms bundler`,
		);
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL tsrx-jsx-return-branches/${failure}`);
}

const payload = {
	suite: 'tsrx-jsx-return-branches',
	iterations,
	targets: rows,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
