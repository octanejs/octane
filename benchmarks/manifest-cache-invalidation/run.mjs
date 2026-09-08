import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = process.env.OCTANE_MANIFEST_CACHE_ROOT
	? path.resolve(process.env.OCTANE_MANIFEST_CACHE_ROOT)
	: path.resolve(HERE, '../..');
const { createOctaneCompiler } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'packages/octane/src/compiler/bundler.js')).href
);

const SMALL_DIRECTORIES = 128;
const LARGE_DIRECTORIES = 5_000;
const INVALIDATIONS_PER_SAMPLE = 2_000;
const iterations = Number.parseInt(process.argv[2] ?? '8', 10);

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Manifest cache invalidation iterations must be a positive integer');
}

function createFixture(name, directoryCount, changedName) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), `octane-manifest-invalidation-${name}-`));
	const manifest = path.join(root, 'package.json');
	fs.writeFileSync(manifest, JSON.stringify({ name: `fixture-${name}`, private: true }));
	const compiler = createOctaneCompiler({ root, strong: true, hmr: false, dev: false });
	let lastResult = null;
	for (let index = 0; index < directoryCount; index++) {
		lastResult = compiler.transform('', path.join(root, `source-${index}`, 'empty.ts'), {
			strong: true,
			hmr: false,
			dev: false,
		});
	}
	const cacheEntries = compiler.manifestRuleCache.size;
	assert.equal(cacheEntries, directoryCount + 1, `${name} populated an unexpected cache size`);
	assert.equal(lastResult?.kind, 'none', `${name} changed empty-source classification`);
	assert.deepEqual(lastResult?.dependencies, [manifest], `${name} lost its owning manifest`);
	return {
		name,
		root,
		compiler,
		cacheEntries,
		changedPath: path.join(root, 'changed', changedName) + '?watch=1#update',
		samples: [],
		meta: {
			directories: directoryCount,
			cacheEntries,
			invalidationsPerSample: INVALIDATIONS_PER_SAMPLE,
			classification: lastResult.kind,
			dependencies: lastResult.dependencies.length,
			missingDependencies: lastResult.missingDependencies.length,
			correctness: 'pass',
		},
		dispose() {
			fs.rmSync(root, { recursive: true, force: true });
		},
	};
}

function sampleFixture(fixture) {
	const started = performance.now();
	for (let index = 0; index < INVALIDATIONS_PER_SAMPLE; index++) {
		fixture.compiler.invalidate(fixture.changedPath);
	}
	const elapsed = performance.now() - started;
	assert.equal(
		fixture.compiler.manifestRuleCache.size,
		fixture.cacheEntries,
		`${fixture.name} invalidation changed a non-matching cache`,
	);
	return elapsed / INVALIDATIONS_PER_SAMPLE;
}

const fixtures = [];
const rows = [];
let failure;

try {
	fixtures.push(createFixture('ordinary-small-cache', SMALL_DIRECTORIES, 'source.ts'));
	fixtures.push(createFixture('ordinary-large-cache', LARGE_DIRECTORIES, 'source.ts'));
	fixtures.push(createFixture('manifest-large-cache', LARGE_DIRECTORIES, 'package.json'));

	for (let warmup = 0; warmup < 2; warmup++) {
		for (const fixture of warmup % 2 === 0 ? fixtures : fixtures.toReversed()) {
			sampleFixture(fixture);
		}
	}
	for (let iteration = 0; iteration < iterations; iteration++) {
		for (const fixture of iteration % 2 === 0 ? fixtures : fixtures.toReversed()) {
			fixture.samples.push(sampleFixture(fixture));
		}
	}

	for (const fixture of fixtures) {
		const invalidate = timingStatForJson(summarizeSamples(fixture.samples), { p99: true });
		rows.push({ name: fixture.name, ops: { invalidate }, meta: fixture.meta });
		console.log(
			`PASS manifest-cache-invalidation/${fixture.name}: ${invalidate.score.toFixed(6)}ms/invalidation ` +
				`across ${fixture.cacheEntries.toLocaleString()} cached directories`,
		);
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL manifest-cache-invalidation/${failure}`);
} finally {
	for (const fixture of fixtures) fixture.dispose();
}

const payload = {
	suite: 'manifest-cache-invalidation',
	iterations,
	targets: rows,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
