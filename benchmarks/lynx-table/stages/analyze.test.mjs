import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { build } from 'esbuild';

import {
	analyzeCreateSample,
	analyzeFcpSample,
	interleavedABSchedule,
	parseRealmSnapshots,
	requireMinimumRepetitions,
	summarizeSamples,
} from './analyze.mjs';

test('requires at least five repetitions for a reportable session', () => {
	assert.throws(() => requireMinimumRepetitions(4), /at least 5/);
	assert.equal(requireMinimumRepetitions(5), 5);
});

test('alternates A/B order in one deterministic host window', () => {
	assert.deepEqual(interleavedABSchedule(5), [
		['control', 'profile'],
		['profile', 'control'],
		['control', 'profile'],
		['profile', 'control'],
		['control', 'profile'],
	]);
});

test('computes median, spread, shares, and same-window ratios', () => {
	const summary = summarizeSamples(
		[
			{ totalMs: 100, stages: { direct: 20, residual: 80 } },
			{ totalMs: 110, stages: { direct: 22, residual: 88 } },
			{ totalMs: 90, stages: { direct: 18, residual: 72 } },
			{ totalMs: 120, stages: { direct: 24, residual: 96 } },
			{ totalMs: 105, stages: { direct: 21, residual: 84 } },
		],
		{ control: [80, 88, 72, 96, 84], reference: [50, 55, 45, 60, 52.5] },
	);
	assert.deepEqual(summary.total, { median: 105, min: 90, max: 120, spread: 30, n: 5 });
	assert.equal(summary.stages.direct.median, 21);
	assert.equal(summary.stages.direct.share, 0.2);
	assert.equal(summary.ratios.control, 1.25);
	assert.equal(summary.ratios.reference, 2);
});

test('attributes only exclusive observed time and assigns the remainder to named residuals', () => {
	assert.deepEqual(
		analyzeFcpSample({
			wallMs: 100,
			main: { mtSliceEvalMs: 15, firstScreenPlanMs: 25, papiCreateMs: 30 },
		}),
		{
			totalMs: 100,
			stages: {
				mt_slice_eval: 15,
				plan_interpretation: 25,
				papi_element_creation: 30,
				layout_flush_residual: 30,
			},
		},
	);
	assert.deepEqual(
		analyzeCreateSample({
			wallMs: 200,
			background: { bgReplayMs: 40, dispatchMs: 20 },
			main: {
				validateMs: 5,
				mtExpandMs: 10,
				prepareMs: 15,
				applyMs: 50,
				papiCreateMs: 30,
				ackMs: 10,
			},
		}),
		{
			totalMs: 200,
			stages: {
				bg_replay: 40,
				wire_clone_transfer: 20,
				mt_validate: 5,
				mt_expand: 10,
				mt_prepare: 15,
				papi_element_creation: 30,
				mt_apply_other: 20,
				mt_ack_publication: 10,
				presentation_residual: 50,
			},
		},
	);
	assert.throws(
		() =>
			analyzeCreateSample({
				wallMs: 100,
				background: {},
				main: { applyMs: 10, papiCreateMs: 11 },
			}),
		/exceeds the enclosing/,
	);
});

test('parses cross-realm snapshots by value without prototype identity', () => {
	const foreign = Object.create(null);
	foreign.kind = 'worker';
	foreign.profile = Object.assign(Object.create(null), {
		dispatchMs: 12,
		bgReplayMs: 34,
	});
	assert.deepEqual(parseRealmSnapshots([foreign]), {
		background: { dispatchMs: 12, bgReplayMs: 34 },
		main: null,
	});
	assert.throws(
		() => parseRealmSnapshots([{ kind: 'frame', profile: { mtExpandMs: 'not-a-number' } }]),
		/finite number/,
	);
});

test('folds stage instrumentation out of a default production bundle', async () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-lynx-stage-profile-'));
	const entry = path.join(temporary, 'entry.ts');
	const control = path.join(temporary, 'control.ts');
	fs.writeFileSync(
		entry,
		[
			"import { lynxWireProfile } from '" +
				path.resolve('packages/lynx/src/core/profiling.ts').replaceAll('\\', '/') +
				"';",
			'if (__OCTANE_LYNX_PROFILE__) {',
			"\tconst profile = lynxWireProfile(); profile['octane-stage-profile-marker'] = 1;",
			'}',
			'globalThis.__octaneProfileFoldProbe = 1;',
		].join('\n'),
	);
	fs.writeFileSync(control, 'globalThis.__octaneProfileFoldProbe = 1;\n');
	try {
		const bundle = async (entryPoint) =>
			(
				await build({
					entryPoints: [entryPoint],
					bundle: true,
					write: false,
					minify: true,
					platform: 'browser',
					define: { __OCTANE_LYNX_PROFILE__: 'false' },
				})
			).outputFiles[0].text;
		const output = await bundle(entry);
		const controlOutput = await bundle(control);
		assert.doesNotMatch(output, /octane-stage-profile-marker|mtSliceEvalMs|bgReplayMs/);
		assert.equal(output, controlOutput);
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true });
	}
});
