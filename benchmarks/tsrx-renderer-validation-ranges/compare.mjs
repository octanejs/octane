import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function targetStat(payload, name) {
	const stat = payload.targets.find((target) => target.name === name)?.ops?.compile;
	if (!stat || !Number.isFinite(stat.score)) throw new Error(`missing compile score for ${name}`);
	return stat;
}

function bounds(stat) {
	const rme = Number.isFinite(stat.scoreRme) ? stat.scoreRme : stat.rme;
	const margin = stat.score * ((Number.isFinite(rme) ? rme : 0) / 100);
	return { lower: stat.score - margin, upper: stat.score + margin };
}

export function evaluateComparison(baseline, candidate) {
	const baselineFocused = bounds(targetStat(baseline, 'focused-high'));
	const candidateFocused = bounds(targetStat(candidate, 'focused-high'));
	const focusedRatio = baselineFocused.lower / candidateFocused.upper;
	const focusedDelta = baselineFocused.lower - candidateFocused.upper;
	const baselinePipeline = bounds(targetStat(baseline, 'pipeline-validated-high'));
	const candidatePipeline = bounds(targetStat(candidate, 'pipeline-validated-high'));
	const pipelineRatio = baselinePipeline.lower / candidatePipeline.upper;
	const lowRatios = ['focused-low', 'pipeline-validated-low'].map((name) => {
		const baselineLow = bounds(targetStat(baseline, name));
		const candidateLow = bounds(targetStat(candidate, name));
		return candidateLow.upper / baselineLow.lower;
	});
	const gates = {
		focusedAbsolute: focusedDelta >= 25,
		focusedRatio: focusedRatio >= 2,
		lowCardinality: lowRatios.every((ratio) => ratio <= 1.1),
		pipelineRatio: pipelineRatio >= 1.2,
	};
	return {
		focusedDelta,
		focusedRatio,
		gates,
		lowRatios,
		pass: Object.values(gates).every(Boolean),
		pipelineRatio,
	};
}

function runCheckout(root, iterations) {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-validation-compare-'));
	const output = path.join(temporary, 'result.json');
	try {
		const run = spawnSync(
			process.execPath,
			[path.join(path.dirname(fileURLToPath(import.meta.url)), 'run.mjs'), String(iterations)],
			{
				cwd: root,
				encoding: 'utf8',
				env: { ...process.env, BENCH_JSON: output, OCTANE_VALIDATION_ROOT: root },
				stdio: ['ignore', 'pipe', 'inherit'],
			},
		);
		if (run.status !== 0) throw new Error(`benchmark failed for ${root}`);
		return JSON.parse(fs.readFileSync(output, 'utf8'));
	} finally {
		fs.rmSync(temporary, { force: true, recursive: true });
	}
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const baselineRoot = process.argv[2];
	const candidateRoot = process.argv[3];
	const iterations = Number.parseInt(process.argv[4] ?? '7', 10);
	if (!baselineRoot || !candidateRoot) {
		throw new Error('usage: node compare.mjs <baseline-root> <candidate-root> [iterations]');
	}
	const comparison = evaluateComparison(
		runCheckout(path.resolve(baselineRoot), iterations),
		runCheckout(path.resolve(candidateRoot), iterations),
	);
	console.log(JSON.stringify(comparison, null, '\t'));
	if (!comparison.pass) process.exitCode = 1;
}
