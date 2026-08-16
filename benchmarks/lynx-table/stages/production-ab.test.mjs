import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { interleavedABSchedule } from './analyze.mjs';
import {
	describeProductionBundle,
	productionAbConfig,
	productionAbMarkdown,
	summarizeProductionAbSamples,
	validateDistinctProductionBundles,
	validateProductionFcpObservation,
	verifyProductionBundle,
} from './production-ab.mjs';
import { DRIVER_CLIENT_JS } from '../web/driver-client.mjs';

const baseArgs = {
	'fcp-production-ab': true,
	'baseline-bundle': 'baseline.bundle',
	'candidate-bundle': 'candidate.bundle',
	'min-content': 'public',
	'fcp-only': false,
	smoke: false,
	reps: '5',
};

test('validates the separate production baseline/candidate protocol', () => {
	assert.deepEqual(productionAbConfig(baseArgs, { rows: 10_000, cwd: '/tmp/protocol' }), {
		baselinePath: '/tmp/protocol/baseline.bundle',
		candidatePath: '/tmp/protocol/candidate.bundle',
		minContentMode: 'public',
		fcpOptions: { minContent: 5 },
		repetitions: 5,
	});
	assert.deepEqual(
		productionAbConfig({ ...baseArgs, 'min-content': 'all' }, { rows: 10_000 }).fcpOptions,
		{ rowCount: 10_000 },
	);
	assert.deepEqual(interleavedABSchedule(5, 'baseline', 'candidate'), [
		['baseline', 'candidate'],
		['candidate', 'baseline'],
		['baseline', 'candidate'],
		['candidate', 'baseline'],
		['baseline', 'candidate'],
	]);
	assert.throws(
		() => productionAbConfig({ ...baseArgs, reps: '4' }, { rows: 10_000 }),
		/at least 5/,
	);
	assert.throws(
		() => productionAbConfig({ ...baseArgs, smoke: true }, { rows: 10_000 }),
		/cannot run as smoke/,
	);
	assert.throws(
		() => productionAbConfig({ ...baseArgs, 'allow-busy-host': true }, { rows: 10_000 }),
		/quiet-host preflight/,
	);
	assert.equal(
		productionAbConfig({ 'fcp-production-ab': false, 'allow-busy-host': true }, { rows: 10_000 }),
		null,
	);
	assert.throws(
		() => productionAbConfig({ ...baseArgs, 'fcp-only': true }, { rows: 10_000 }),
		/separate from candidate-only/,
	);
	assert.throws(
		() =>
			productionAbConfig({ ...baseArgs, 'candidate-bundle': 'baseline.bundle' }, { rows: 10_000 }),
		/different paths/,
	);
	assert.throws(
		() => productionAbConfig({ ...baseArgs, 'min-content': 'other' }, { rows: 10_000 }),
		/public.*all/,
	);
});

async function runDriverFcp(frames, options) {
	let now = 0;
	let current = frames[0];
	const callbacks = [];
	const context = vm.createContext({
		document: { body: { childNodes: [], nodeType: 1 } },
		performance: { now: () => now, timeOrigin: 1000 },
		requestAnimationFrame: (callback) => callbacks.push(callback),
		setTimeout,
		window: { addEventListener() {}, removeEventListener() {} },
	});
	vm.runInContext(DRIVER_CLIENT_JS, context);
	context.__x.contentCount = () => current.content;
	context.__x.rowCount = () => current.rows;
	context.__x.tableOracle = () => ({ rows: current.rows, checksum: 42 });
	const result = context.__x.fcp({ ...options, idleMs: 50, timeoutMs: 1000 });
	for (const frame of frames) {
		current = frame;
		now = frame.now;
		const callback = callbacks.shift();
		assert.equal(typeof callback, 'function');
		callback();
	}
	return result;
}

test('shared FCP driver distinguishes public content from exact all-row predicates', async () => {
	const publicObservation = await runDriverFcp(
		[
			{ now: 10, content: 4, rows: 1000 },
			{ now: 20, content: 5, rows: 1000 },
			{ now: 70, content: 5, rows: 1000 },
		],
		{ minContent: 5 },
	);
	assert.equal(publicObservation.fcp, 20);
	assert.equal(publicObservation.finalRows, 1000);
	assert.deepEqual({ ...publicObservation.tableOracle }, { rows: 1000, checksum: 42 });

	const allRowsObservation = await runDriverFcp(
		[
			{ now: 10, content: 10_000, rows: 5000 },
			{ now: 20, content: 20_000, rows: 10_000 },
			{ now: 70, content: 20_000, rows: 10_000 },
		],
		{ rowCount: 10_000 },
	);
	assert.equal(allRowsObservation.fcp, 20);
	assert.equal(allRowsObservation.finalRows, 10_000);
});

test('records immutable production bundle provenance and rejects profile markers', () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-production-ab-'));
	try {
		const bundle = path.join(temporary, 'candidate.bundle');
		fs.writeFileSync(bundle, 'production bundle');
		const descriptor = describeProductionBundle('candidate', bundle);
		assert.equal(descriptor.path, bundle);
		assert.equal(descriptor.bytes, 17);
		assert.equal(
			descriptor.sha256,
			'18c1950079684033da4352bf23a3fbf8ecd3d0e60414262f13a019ecd35a11c5',
		);
		const copiedBundle = path.join(temporary, 'copied.bundle');
		fs.copyFileSync(bundle, copiedBundle);
		assert.throws(
			() =>
				validateDistinctProductionBundles(
					describeProductionBundle('baseline', bundle),
					describeProductionBundle('candidate', copiedBundle),
				),
			/identical SHA-256/,
		);

		fs.writeFileSync(bundle, 'changed production bundle');
		assert.throws(() => verifyProductionBundle('candidate', descriptor), /changed during/);

		fs.writeFileSync(bundle, '__OCTANE_LYNX_PROF');
		assert.throws(() => describeProductionBundle('candidate', bundle), /profiling marker/);
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true });
	}
});

test('requires the final row-count oracle and summarizes FCP separately from settled', () => {
	const observation = validateProductionFcpObservation(
		'candidate',
		{
			fcp: 20,
			fcpEpoch: 120,
			settled: 80,
			finalCount: 2000,
			finalRows: 1000,
			tableOracle: { rows: 1000, checksum: 42 },
			dnf: false,
		},
		1000,
		{ minContent: 5 },
	);
	assert.deepEqual(observation, {
		fcpMs: 20,
		fcpEpochMs: 120,
		settledMs: 80,
		finalCount: 2000,
		finalRows: 1000,
		checksum: 42,
	});
	assert.throws(
		() =>
			validateProductionFcpObservation(
				'baseline',
				{
					fcp: 20,
					fcpEpoch: 120,
					settled: 80,
					finalCount: 4,
					finalRows: 1000,
					tableOracle: { rows: 1000, checksum: 42 },
					dnf: false,
				},
				1000,
				{ minContent: 5 },
			),
		/finalCount 4.*minContent 5/,
	);
	assert.throws(
		() =>
			validateProductionFcpObservation(
				'baseline',
				{
					fcp: 20,
					fcpEpoch: 120,
					settled: 80,
					finalCount: 2000,
					finalRows: 999,
					tableOracle: { rows: 999, checksum: 42 },
					dnf: false,
				},
				1000,
				{ rowCount: 1000 },
			),
		/final row count 999/,
	);
	assert.throws(
		() =>
			validateProductionFcpObservation(
				'baseline',
				{
					fcp: null,
					fcpEpoch: null,
					settled: null,
					finalCount: 0,
					finalRows: 0,
					tableOracle: { rows: 0, checksum: 0 },
					dnf: true,
				},
				1000,
				{ rowCount: 1000 },
			),
		/did not settle/,
	);

	const samples = {
		baseline: [10, 12, 11, 13, 9].map((fcpMs) => ({
			fcpMs,
			settledMs: fcpMs + 40,
			finalRows: 1000,
			finalCount: 2000,
			checksum: 42,
		})),
		candidate: [8, 10, 9, 11, 7].map((fcpMs) => ({
			fcpMs,
			settledMs: fcpMs + 30,
			finalRows: 1000,
			finalCount: 2000,
			checksum: 42,
		})),
	};
	const results = summarizeProductionAbSamples(samples);
	assert.equal(results.baseline.fcp.median, 11);
	assert.equal(results.candidate.fcp.median, 9);
	assert.equal(results.baseline.settled.median, 51);
	assert.equal(results.candidate.settled.median, 39);
	assert.equal(results.ratios.fcp, 9 / 11);
	assert.equal(results.ratios.settled, 39 / 51);
	assert.deepEqual(results.semantic, { finalRows: 1000, finalCount: 2000, checksum: 42 });
	assert.throws(
		() =>
			summarizeProductionAbSamples({
				baseline: samples.baseline,
				candidate: [{ ...samples.candidate[0], finalCount: 1999 }, ...samples.candidate.slice(1)],
			}),
		/semantic tuple/,
	);
	assert.throws(
		() =>
			summarizeProductionAbSamples({
				baseline: samples.baseline,
				candidate: [{ ...samples.candidate[0], finalRows: 999 }, ...samples.candidate.slice(1)],
			}),
		/semantic tuple/,
	);
	assert.throws(
		() =>
			summarizeProductionAbSamples({
				baseline: samples.baseline,
				candidate: [{ ...samples.candidate[0], checksum: 41 }, ...samples.candidate.slice(1)],
			}),
		/semantic tuple/,
	);

	const markdown = productionAbMarkdown({
		meta: {
			rows: 1000,
			date: '2026-08-16T00:00:00.000Z',
			cpus: 8,
			cpuModel: 'test',
			platform: 'linux',
			release: 'test',
			node: 'v24',
			chromium: 'test',
			protocol: 'baseline/candidate AB/BA; no profile reads',
			repetitions: 5,
		},
		threshold: { mode: 'public', fcpOptions: { minContent: 5 }, rowCount: 1000 },
		bundles: {
			baseline: { path: '/baseline', bytes: 1, sha256: 'a' },
			candidate: { path: '/candidate', bytes: 2, sha256: 'b' },
		},
		results,
	});
	assert.match(markdown, /production FCP baseline\/candidate/);
	assert.match(markdown, /contentCount>=5.*finalRows=1000.*finalCount=2000.*checksum=42/);
	assert.match(markdown, /candidate\/baseline/);
	assert.doesNotMatch(markdown, /control|rawProfile|profile cell/);
});
