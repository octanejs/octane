import assert from 'node:assert/strict';
import fs from 'node:fs';
import createCategoricalIndex from '../../packages/visx/src/theme/react/categoricalIndex.ts';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const iterations = Number.parseInt(process.argv[2] ?? '8', 10);

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Visx categorical-scale iterations must be a positive integer');
}

function createScenario(size, builds) {
	const domain = Array.from({ length: size }, (_, index) => `key-${index}`);
	domain[size - 1] = domain[0];
	const keys = [...domain.slice(0, -1), domain[0], 'missing'];
	return { size, builds, domain, keys, lookups: builds * keys.length };
}

const scenarios = [
	createScenario(16, 60_000),
	createScenario(64, 20_000),
	createScenario(4_096, 16),
];
const implementations = [
	{
		name: 'scan',
		createIndex: (domain) => (key) => domain.indexOf(key),
	},
	{
		name: 'indexed',
		createIndex: createCategoricalIndex,
	},
];
const targets = scenarios.flatMap((scenario) =>
	implementations.map((implementation) => ({
		...implementation,
		...scenario,
		name: `${implementation.name}-${scenario.size}`,
		samples: [],
	})),
);
const expectedChecksums = new Map();

function runLookups(target) {
	const started = performance.now();
	let checksum = 0;
	for (let build = 0; build < target.builds; build++) {
		const indexOf = target.createIndex(target.domain);
		for (const key of target.keys) checksum += indexOf(key);
	}
	return { elapsed: performance.now() - started, checksum };
}

for (const scenario of scenarios) {
	const scan = targets.find((target) => target.name === `scan-${scenario.size}`);
	const indexed = targets.find((target) => target.name === `indexed-${scenario.size}`);
	const scanIndex = scan.createIndex(scenario.domain);
	const indexedIndex = indexed.createIndex(scenario.domain);
	for (const key of scenario.keys) {
		assert.equal(indexedIndex(key), scanIndex(key), `${scenario.size}-key lookup drifted`);
	}
	assert.equal(scanIndex(scenario.domain[0]), 0, 'scan lost first match');
	assert.equal(indexedIndex(scenario.domain[0]), 0, 'index lost first match');
	assert.equal(scanIndex('missing'), -1, 'scan lost missing sentinel');
	assert.equal(indexedIndex('missing'), -1, 'index lost missing sentinel');
	const scanWarmup = runLookups(scan);
	const indexedWarmup = runLookups(indexed);
	assert.equal(indexedWarmup.checksum, scanWarmup.checksum, `${scenario.size}-key warmup drifted`);
	expectedChecksums.set(scenario.size, scanWarmup.checksum);
}

for (let iteration = 0; iteration < iterations; iteration++) {
	const order = iteration % 2 === 0 ? targets : targets.toReversed();
	for (const target of order) {
		const sample = runLookups(target);
		assert.equal(
			sample.checksum,
			expectedChecksums.get(target.size),
			`${target.name} timed checksum drifted`,
		);
		target.samples.push((sample.elapsed * 1_000) / target.lookups);
	}
}

const rows = targets.map((target) => {
	const summary = summarizeSamples(target.samples);
	console.log(
		`PASS visx-categorical-scale/${target.name}: ` + `${summary.score.toFixed(3)}ms/1,000 lookups`,
	);
	return {
		name: target.name,
		ops: { lookup_per_1000: timingStatForJson(summary) },
		meta: {
			domainSize: target.size,
			lookupsPerSample: target.lookups,
			indexBuildsPerSample: target.builds,
			duplicateIndex: 0,
			missingIndex: -1,
			correctness: 'pass',
		},
	};
});

const payload = {
	suite: 'visx-categorical-scale',
	iterations,
	targets: rows,
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
