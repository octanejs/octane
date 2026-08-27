import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = process.env.OCTANE_TEXT_TYPE_ROOT
	? path.resolve(process.env.OCTANE_TEXT_TYPE_ROOT)
	: path.resolve(HERE, '../..');
const { createTextTypeProject } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'packages/octane/src/compiler/typescript.js')).href
);

const SMALL_ROOTS = 32;
const LARGE_ROOTS = 20_000;
const SNAPSHOTS_PER_SAMPLE = 500;
const TARGET_SOURCE =
	'export function Target(props: { label: string }) { return <p>{props.label}</p>; }\n';
const iterations = Number.parseInt(process.argv[2] ?? '9', 10);

function write(directory, filename, source) {
	const target = path.join(directory, filename);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, source);
	return target;
}

function createFixture(name, unrelatedRoots) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), `octane-text-type-roots-${name}-`));
	const target = write(directory, 'zz-target.tsx', TARGET_SOURCE);
	write(directory, 'jsx.d.ts', 'namespace JSX { interface IntrinsicElements { p: unknown } }\n');
	const rootNames = Array.from(
		{ length: unrelatedRoots },
		(_, index) => `roots/root-${String(index).padStart(5, '0')}.ts`,
	);
	const tsconfig = write(
		directory,
		'tsconfig.json',
		JSON.stringify({
			compilerOptions: {
				target: 'ESNext',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				jsx: 'preserve',
				strict: true,
				noEmit: true,
				types: [],
			},
			// The missing roots are deliberate: they make root bookkeeping scale
			// without adding TypeScript parse or bind work to the timed snapshots.
			files: [...rootNames, 'jsx.d.ts', 'zz-target.tsx'],
		}),
	);
	const project = createTextTypeProject({ tsconfig });
	return {
		name,
		directory,
		target,
		project,
		rootCount: unrelatedRoots + 2,
		samples: [],
		dispose() {
			project.dispose();
			fs.rmSync(directory, { recursive: true, force: true });
		},
	};
}

function semanticFacts(facts) {
	return {
		version: facts.version,
		sourceVersion: facts.sourceVersion,
		stringChildRanges: facts.stringChildRanges,
	};
}

function validateFixture(fixture) {
	const facts = fixture.project.snapshot(fixture.target);
	const children = facts.stringChildRanges.map(([start, end]) => TARGET_SOURCE.slice(start, end));
	assert.deepEqual(children, ['props.label'], `${fixture.name} changed string-child evidence`);
	assert.equal(facts.filename, fixture.target.replaceAll('\\', '/'));
	fixture.facts = facts;
	fixture.meta = {
		rootCount: fixture.rootCount,
		snapshotsPerSample: SNAPSHOTS_PER_SAMPLE,
		factChecksum: createHash('sha256')
			.update(JSON.stringify(semanticFacts(facts)))
			.digest('hex'),
		projectVersion: facts.projectVersion,
		stringChildren: children,
		correctness: 'pass',
	};
}

function sampleFixture(fixture) {
	let facts;
	const started = performance.now();
	for (let index = 0; index < SNAPSHOTS_PER_SAMPLE; index++) {
		facts = fixture.project.snapshot(fixture.target);
	}
	const elapsed = performance.now() - started;
	assert.strictEqual(facts, fixture.facts, `${fixture.name} failed to reuse stable facts`);
	return elapsed / SNAPSHOTS_PER_SAMPLE;
}

let failure;
const fixtures = [];
const rows = [];

try {
	if (!Number.isSafeInteger(iterations) || iterations < 1) {
		throw new Error('Text type root iterations must be a positive integer');
	}
	fixtures.push(createFixture('small-root', SMALL_ROOTS));
	fixtures.push(createFixture('large-root', LARGE_ROOTS));
	for (const fixture of fixtures) validateFixture(fixture);
	assert.equal(
		fixtures[0].meta.factChecksum,
		fixtures[1].meta.factChecksum,
		'root count changed target text facts',
	);

	for (let warmup = 0; warmup < 3; warmup++) {
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
		const snapshot = timingStatForJson(summarizeSamples(fixture.samples), { p99: true });
		rows.push({ name: fixture.name, ops: { snapshot }, meta: fixture.meta });
		console.log(
			`PASS text-type-roots/${fixture.name}: ${snapshot.score.toFixed(4)}ms per warm snapshot ` +
				`across ${fixture.rootCount.toLocaleString()} configured roots`,
		);
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL text-type-roots/${failure}`);
} finally {
	for (const fixture of fixtures) fixture.dispose();
}

const payload = {
	suite: 'text-type-roots',
	iterations,
	targets: rows,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
