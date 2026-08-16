import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { requireMinimumRepetitions, summarizeSamples } from './analyze.mjs';

const PROFILE_MARKERS = [
	'__OCTANE_LYNX_PROF',
	'__OCTANE_LYNX_MT_SLICE_LOAD_START_EPOCH__',
	'bgReplayMs',
	'firstScreenPlanMs',
	'firstScreenRenderMs',
	'firstScreenCommandStageMs',
	'firstScreenContainerMs',
	'firstScreenPrepareMs',
	'firstScreenApplyMs',
	'firstScreenPapiCreateMs',
	'firstScreenCaptureMs',
	'firstScreenCommands',
	'firstScreenHosts',
	'firstScreenLogicalIds',
	'mtSliceEvalMs',
];

export function productionAbConfig(args, { rows, cwd = process.cwd() }) {
	const enabled = args['fcp-production-ab'] === true;
	const baseline = args['baseline-bundle'];
	const candidate = args['candidate-bundle'];
	if (!enabled) {
		if (baseline !== undefined || candidate !== undefined) {
			throw new TypeError('baseline-bundle and candidate-bundle require --fcp-production-ab.');
		}
		return null;
	}
	if (args.smoke)
		throw new TypeError('production FCP A/B requires n >= 5 and cannot run as smoke.');
	if (args['allow-busy-host']) {
		throw new TypeError(
			'production FCP A/B is always reportable and cannot override the quiet-host preflight.',
		);
	}
	if (args['fcp-only']) {
		throw new TypeError(
			'production FCP A/B is separate from candidate-only --fcp-only attribution.',
		);
	}
	if (typeof baseline !== 'string' || baseline.length === 0) {
		throw new TypeError('production FCP A/B requires --baseline-bundle.');
	}
	if (typeof candidate !== 'string' || candidate.length === 0) {
		throw new TypeError('production FCP A/B requires --candidate-bundle.');
	}
	const baselinePath = path.resolve(cwd, baseline);
	const candidatePath = path.resolve(cwd, candidate);
	if (baselinePath === candidatePath) {
		throw new TypeError('baseline-bundle and candidate-bundle must be different paths.');
	}
	const minContentMode = args['min-content'];
	if (minContentMode !== 'public' && minContentMode !== 'all') {
		throw new TypeError('min-content must be "public" or "all".');
	}
	if (minContentMode === 'public' && rows < 5) {
		throw new TypeError('public min-content requires at least 5 final rows.');
	}
	return Object.freeze({
		baselinePath,
		candidatePath,
		minContentMode,
		fcpOptions: Object.freeze(minContentMode === 'public' ? { minContent: 5 } : { rowCount: rows }),
		repetitions: requireMinimumRepetitions(args.reps),
	});
}

export function describeProductionBundle(label, file) {
	const absolutePath = path.resolve(file);
	const bytes = fs.readFileSync(absolutePath);
	for (const marker of PROFILE_MARKERS) {
		if (bytes.includes(Buffer.from(marker))) {
			throw new Error(`${label} production bundle retained stage profiling marker ${marker}.`);
		}
	}
	return Object.freeze({
		path: absolutePath,
		bytes: bytes.length,
		sha256: createHash('sha256').update(bytes).digest('hex'),
	});
}

export function validateDistinctProductionBundles(baseline, candidate) {
	if (baseline.sha256 === candidate.sha256) {
		throw new Error('baseline and candidate production bundles have identical SHA-256 content.');
	}
	return Object.freeze({ baseline, candidate });
}

export function verifyProductionBundle(label, descriptor) {
	const current = describeProductionBundle(label, descriptor.path);
	if (current.bytes !== descriptor.bytes || current.sha256 !== descriptor.sha256) {
		throw new Error(`${label} production bundle changed during the A/B window.`);
	}
}

function finite(value, label) {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		throw new TypeError(`${label} must be a finite number greater than or equal to zero.`);
	}
	return value;
}

export function validateProductionFcpObservation(label, observation, rows, fcpOptions) {
	if (observation === null || typeof observation !== 'object' || Array.isArray(observation)) {
		throw new TypeError(`${label} FCP observation must be an object.`);
	}
	if (observation.dnf !== false || observation.fcp === null || observation.settled === null) {
		throw new Error(`${label} production FCP did not settle.`);
	}
	const fcpMs = finite(observation.fcp, `${label} fcp`);
	const settledMs = finite(observation.settled, `${label} settled`);
	const fcpEpochMs = finite(observation.fcpEpoch, `${label} fcpEpoch`);
	if (settledMs + 0.5 < fcpMs) {
		throw new Error(`${label} settled before its FCP observation.`);
	}
	if (!Number.isSafeInteger(observation.finalCount) || observation.finalCount < 0) {
		throw new Error(`${label} finalCount must be a non-negative safe integer.`);
	}
	if (fcpOptions.minContent !== undefined && observation.finalCount < fcpOptions.minContent) {
		throw new Error(
			`${label} finalCount ${observation.finalCount} did not reach minContent ${fcpOptions.minContent}.`,
		);
	}
	const oracle = observation.tableOracle;
	if (oracle === null || typeof oracle !== 'object' || Array.isArray(oracle)) {
		throw new TypeError(`${label} table oracle must be an object.`);
	}
	if (!Number.isSafeInteger(observation.finalRows) || observation.finalRows !== rows) {
		throw new Error(
			`${label} final row count ${String(observation.finalRows)} did not match ${rows} rows.`,
		);
	}
	if (!Number.isSafeInteger(oracle.rows) || oracle.rows !== observation.finalRows) {
		throw new Error(`${label} row count ${String(oracle.rows)} did not match ${rows} rows.`);
	}
	if (!Number.isSafeInteger(oracle.checksum) || oracle.checksum < 0) {
		throw new Error(`${label} table checksum must be a non-negative safe integer.`);
	}
	return Object.freeze({
		fcpMs,
		fcpEpochMs,
		settledMs,
		finalCount: observation.finalCount,
		finalRows: observation.finalRows,
		checksum: oracle.checksum,
	});
}

function summarizeMetric(samples, field) {
	return summarizeSamples(
		samples.map((sample) => ({ totalMs: sample[field], stages: { [field]: sample[field] } })),
	).total;
}

export function summarizeProductionAbSamples(samples) {
	const allSamples = [...samples.baseline, ...samples.candidate];
	if (allSamples.length === 0) {
		throw new Error('production baseline/candidate samples are empty.');
	}
	const semantic = Object.freeze({
		finalRows: allSamples[0].finalRows,
		finalCount: allSamples[0].finalCount,
		checksum: allSamples[0].checksum,
	});
	if (
		allSamples.some(
			(sample) =>
				sample.finalRows !== semantic.finalRows ||
				sample.finalCount !== semantic.finalCount ||
				sample.checksum !== semantic.checksum,
		)
	) {
		throw new Error(
			'production baseline/candidate samples did not preserve the settled {finalRows, finalCount, checksum} semantic tuple.',
		);
	}
	const baseline = {
		fcp: summarizeMetric(samples.baseline, 'fcpMs'),
		settled: summarizeMetric(samples.baseline, 'settledMs'),
	};
	const candidate = {
		fcp: summarizeMetric(samples.candidate, 'fcpMs'),
		settled: summarizeMetric(samples.candidate, 'settledMs'),
	};
	return {
		baseline,
		candidate,
		semantic,
		ratios: {
			fcp: baseline.fcp.median === 0 ? null : candidate.fcp.median / baseline.fcp.median,
			settled:
				baseline.settled.median === 0 ? null : candidate.settled.median / baseline.settled.median,
		},
	};
}

function round(value, digits = 2) {
	return Number(value.toFixed(digits));
}

export function productionAbMarkdown(report) {
	const ratio = (value) => (value === null ? 'n/a' : `${round(value, 3)}×`);
	const predicate =
		report.threshold.mode === 'public'
			? `contentCount>=${report.threshold.fcpOptions.minContent}`
			: `rowCount=${report.threshold.fcpOptions.rowCount}`;
	return [
		`# Lynx ${report.meta.rows.toLocaleString('en-US')}-row production FCP baseline/candidate A/B`,
		'',
		`- measured: ${report.meta.date}`,
		`- host: ${report.meta.cpus}× ${report.meta.cpuModel}; ${report.meta.platform} ${report.meta.release}; Node ${report.meta.node}; Chromium ${report.meta.chromium}`,
		`- protocol: ${report.meta.protocol}`,
		`- repetitions: n=${report.meta.repetitions} per baseline/candidate cell`,
		`- threshold: ${report.threshold.mode} ${predicate}; settled finalRows=${report.results.semantic.finalRows}; finalCount=${report.results.semantic.finalCount}; checksum=${report.results.semantic.checksum}`,
		`- baseline: ${report.bundles.baseline.path} (${report.bundles.baseline.bytes} B, sha256 ${report.bundles.baseline.sha256})`,
		`- candidate: ${report.bundles.candidate.path} (${report.bundles.candidate.bytes} B, sha256 ${report.bundles.candidate.sha256})`,
		'',
		'| metric | baseline median (min–max) | candidate median (min–max) | candidate/baseline |',
		'|---|---:|---:|---:|',
		`| FCP | ${round(report.results.baseline.fcp.median)} (${round(report.results.baseline.fcp.min)}–${round(report.results.baseline.fcp.max)}) ms | ${round(report.results.candidate.fcp.median)} (${round(report.results.candidate.fcp.min)}–${round(report.results.candidate.fcp.max)}) ms | ${ratio(report.results.ratios.fcp)} |`,
		`| settled | ${round(report.results.baseline.settled.median)} (${round(report.results.baseline.settled.min)}–${round(report.results.baseline.settled.max)}) ms | ${round(report.results.candidate.settled.median)} (${round(report.results.candidate.settled.min)}–${round(report.results.candidate.settled.max)}) ms | ${ratio(report.results.ratios.settled)} |`,
		'',
	].join('\n');
}
