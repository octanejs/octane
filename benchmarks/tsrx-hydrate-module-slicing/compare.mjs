import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(HERE, 'run.mjs');

function targetStat(payload, name) {
	const stat = target(payload, name).ops?.compile;
	assert.ok(stat && Number.isFinite(stat.score), `${name} has no finite compile score`);
	return stat;
}

function target(payload, name) {
	const entry = payload.targets?.find((candidate) => candidate.name === name);
	assert.equal(entry?.meta?.correctness, 'pass', `${name} did not pass semantics`);
	return entry;
}

function assertEquivalentOutput(baseline, candidate, name) {
	const before = target(baseline, name).meta;
	const after = target(candidate, name).meta;
	for (const field of [
		'boundaryRequests',
		'rootChecksum',
		'rootOutputBytes',
		'serverChecksum',
		'serverOutputBytes',
	]) {
		assert.equal(after[field], before[field], `${name} changed ${field}`);
	}
}

function bounds(stat) {
	const central = Number.isFinite(stat.mean) ? stat.mean : stat.score;
	const margin = central * ((Number.isFinite(stat.rme) ? stat.rme : 0) / 100);
	return { central, lower: central - margin, upper: central + margin };
}

function conservativeImprovement(baseline, candidate) {
	const before = bounds(baseline);
	const after = bounds(candidate);
	return {
		absoluteMs: before.lower - after.upper,
		ratio: before.lower / after.upper,
	};
}

export function evaluateComparison(baseline, candidate) {
	for (const name of ['focused-movable-low', 'focused-movable-high', 'focused-retained-high']) {
		assertEquivalentOutput(baseline, candidate, name);
	}
	const focused = conservativeImprovement(
		targetStat(baseline, 'focused-movable-high'),
		targetStat(candidate, 'focused-movable-high'),
	);
	const pipeline = conservativeImprovement(
		targetStat(baseline, 'pipeline-movable-high'),
		targetStat(candidate, 'pipeline-movable-high'),
	);
	const baselineControl = bounds(targetStat(baseline, 'focused-retained-high'));
	const candidateControl = bounds(targetStat(candidate, 'focused-retained-high'));
	const controlRatio = candidateControl.central / baselineControl.central;
	const controlRegressed =
		candidateControl.lower > baselineControl.upper * 1.05 || controlRatio > 1.05;
	const low = conservativeImprovement(
		targetStat(baseline, 'pipeline-movable-low'),
		targetStat(candidate, 'pipeline-movable-low'),
	);
	const gates = {
		control: !controlRegressed,
		focusedAbsolute: focused.absoluteMs >= 200,
		focusedRatio: focused.ratio >= 1.5,
	};
	return {
		controlRatio,
		focused,
		gates,
		low,
		pass: Object.values(gates).every(Boolean),
		pipeline,
	};
}

function compilerDigest(root) {
	const source = fs.readFileSync(
		path.join(root, 'packages/octane/src/compiler/hydrate-boundaries.js'),
	);
	return createHash('sha256').update(source).digest('hex');
}

function runCheckout(root, iterations) {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-hydrate-slicing-'));
	const output = path.join(temporary, 'result.json');
	try {
		const run = spawnSync(process.execPath, [RUNNER, String(iterations), '--raw-samples'], {
			cwd: HERE,
			encoding: 'utf8',
			env: { ...process.env, BENCH_JSON: output, OCTANE_HYDRATE_SLICING_ROOT: root },
			maxBuffer: 10 * 1024 * 1024,
			stdio: ['ignore', 'pipe', 'inherit'],
		});
		if (run.error) throw run.error;
		if (run.status !== 0) {
			throw new Error(`benchmark failed for ${root}: ${(run.stderr || run.stdout).trim()}`);
		}
		const payload = JSON.parse(fs.readFileSync(output, 'utf8'));
		if (payload.failed) throw new Error(`benchmark failed for ${root}: ${payload.failed}`);
		return payload;
	} finally {
		fs.rmSync(temporary, { force: true, recursive: true });
	}
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const baselineRoot = process.argv[2];
	const candidateRoot = process.argv[3];
	const iterations = Number.parseInt(process.argv[4] ?? '7', 10);
	if (!baselineRoot || !candidateRoot || !Number.isSafeInteger(iterations) || iterations < 1) {
		throw new Error('usage: node compare.mjs <baseline-root> <candidate-root> [iterations]');
	}
	const baseline = path.resolve(baselineRoot);
	const candidate = path.resolve(candidateRoot);
	assert.notEqual(baseline, candidate, 'baseline and candidate roots must differ');
	assert.notEqual(
		compilerDigest(baseline),
		compilerDigest(candidate),
		'baseline and candidate compiler sources are identical',
	);
	const comparison = evaluateComparison(
		runCheckout(baseline, iterations),
		runCheckout(candidate, iterations),
	);
	console.log(JSON.stringify(comparison, null, '\t'));
	if (!comparison.pass) process.exitCode = 1;
}
