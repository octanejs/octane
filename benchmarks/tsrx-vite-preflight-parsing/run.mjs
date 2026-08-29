import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import {
	createTransformCase,
	descriptorClassificationFromSharedAst,
	descriptorClassificationFromStrings,
	EXPECTED_CLASSIFICATION_CHECKSUM,
	sourceFor,
	valueDigest,
} from './harness.mjs';

const HERE = import.meta.dirname;
const iterations = Number.parseInt(process.argv[2] ?? '7', 10);

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('TSRX Vite preflight parsing iterations must be a positive integer');
}

function characterizeParses() {
	const output = execFileSync(
		process.execPath,
		[
			'--no-warnings',
			'--loader',
			path.join(HERE, 'parse-counter-loader.mjs'),
			path.join(HERE, 'count-worker.mjs'),
		],
		{
			cwd: HERE,
			env: process.env,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'inherit'],
		},
	);
	return JSON.parse(output);
}

const integrated = [
	{ size: 'small', componentCount: 8, mode: 'production-client' },
	{ size: 'large', componentCount: 256, mode: 'production-client' },
	{ size: 'small', componentCount: 8, mode: 'production-server' },
	{ size: 'large', componentCount: 256, mode: 'production-server' },
].map((entry) => ({ ...entry, samples: [], transform: createTransformCase(entry) }));

const classificationSource = sourceFor(256);
const classificationId = path.join(HERE, 'generated', 'classification-256.tsrx');
const classificationSamples = { reparsed: [], shared: [] };
let classificationChecksum;
let failure;
let parseCounts = [];

function measureClassification(kind) {
	const started = performance.now();
	const value =
		kind === 'reparsed'
			? descriptorClassificationFromStrings(classificationSource, classificationId)
			: descriptorClassificationFromSharedAst(classificationSource, classificationId);
	const elapsed = performance.now() - started;
	const checksum = valueDigest(value);
	classificationChecksum ??= EXPECTED_CLASSIFICATION_CHECKSUM;
	assert.equal(checksum, classificationChecksum, `${kind} descriptor classification changed`);
	return elapsed;
}

async function measureIntegrated(entry) {
	const { elapsed, snapshot } = await entry.transform.run();
	entry.samples.push(elapsed);
	entry.snapshot = snapshot;
}

try {
	parseCounts = characterizeParses();
	assert.deepEqual(
		parseCounts.map((entry) => entry.total),
		[2, 2, 2, 2, 3, 3],
		'Vite parse-count matrix changed',
	);

	for (let warmup = 0; warmup < 2; warmup++) {
		const ordered = warmup % 2 === 0 ? integrated : integrated.toReversed();
		for (const entry of ordered) await entry.transform.run();
		measureClassification(warmup % 2 === 0 ? 'reparsed' : 'shared');
		measureClassification(warmup % 2 === 0 ? 'shared' : 'reparsed');
	}

	for (let iteration = 0; iteration < iterations; iteration++) {
		const ordered = iteration % 2 === 0 ? integrated : integrated.toReversed();
		for (const entry of ordered) await measureIntegrated(entry);
		const kinds = iteration % 2 === 0 ? ['reparsed', 'shared'] : ['shared', 'reparsed'];
		for (const kind of kinds) classificationSamples[kind].push(measureClassification(kind));
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL tsrx-vite-preflight-parsing/${failure}`);
}

const targets = [];
if (!failure) {
	for (const entry of integrated) {
		const op = timingStatForJson(summarizeSamples(entry.samples));
		targets.push({
			name: `integrated-${entry.size}-${entry.mode.replace('production-', '')}`,
			ops: { transform: op },
			meta: {
				components: entry.componentCount,
				sourceBytes: Buffer.byteLength(entry.transform.source),
				...entry.snapshot,
				correctness: 'pass',
			},
		});
		console.log(
			`PASS tsrx-vite-preflight-parsing/${entry.size}-${entry.mode}: ${op.score.toFixed(3)}ms`,
		);
	}

	for (const kind of ['reparsed', 'shared']) {
		const op = timingStatForJson(summarizeSamples(classificationSamples[kind]));
		targets.push({
			name: `classification-${kind === 'shared' ? 'shared-ast' : kind}`,
			ops: { classify: op },
			meta: {
				classifications: ['descriptor-children-imports', 'descriptor-children-exports'],
				classificationChecksum,
				sourceBytes: Buffer.byteLength(classificationSource),
				correctness: 'pass',
			},
		});
		console.log(
			`PASS tsrx-vite-preflight-parsing/classification-${kind}: ${op.score.toFixed(3)}ms`,
		);
	}

	for (const entry of parseCounts) delete entry.calls;
	targets.push({
		name: 'parse-count-matrix',
		ops: {},
		meta: {
			cases: parseCounts,
			matrixChecksum: valueDigest(parseCounts),
			correctness: 'pass',
		},
	});
	console.log(
		`PASS tsrx-vite-preflight-parsing/parse-counts: ${parseCounts.map((entry) => entry.total).join('/')}`,
	);
}

const payload = {
	suite: 'tsrx-vite-preflight-parsing',
	iterations,
	targets,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
