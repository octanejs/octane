import { scoreOf } from './stats.mjs';

function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
}

function record(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function indexRun(result, index) {
	const label = `run ${index + 1}`;
	if (!record(result) || typeof result.suite !== 'string' || result.suite.length === 0) {
		throw new Error(`${label}: missing suite name`);
	}
	if (!Array.isArray(result.targets) || result.targets.length === 0) {
		throw new Error(`${label}: missing targets`);
	}
	if (result.harnessExit !== undefined && !Number.isSafeInteger(result.harnessExit)) {
		throw new Error(`${label}: invalid harness exit status`);
	}
	const targets = new Map();
	for (const target of result.targets) {
		if (!record(target) || typeof target.name !== 'string' || target.name.length === 0) {
			throw new Error(`${label}: missing target name`);
		}
		if (targets.has(target.name)) throw new Error(`${label}: duplicate target ${target.name}`);
		// Some suites also publish metadata-only semantic targets with no timings.
		if (!record(target.ops)) throw new Error(`${label}/${target.name}: missing operations`);
		for (const [name, stat] of Object.entries(target.ops)) {
			if (!name || !record(stat) || scoreOf(stat) === null || !Number.isFinite(stat.min)) {
				throw new Error(`${label}/${target.name}/${name}: expected finite score and minimum`);
			}
		}
		targets.set(target.name, target);
	}
	return targets;
}

function sameNames(expected, actual) {
	return expected.length === actual.length && expected.every((name) => actual.includes(name));
}

// Repeat whole harness runs rather than treating their within-run distributions
// as independent samples. Every run remains available for correctness and noise
// diagnosis; the summary never invents a pooled p95, deviation, or sample count.
export function summarizeRuns(results) {
	if (!Array.isArray(results) || results.length === 0) {
		throw new Error('expected at least one complete benchmark run');
	}
	const indexed = results.map(indexRun);
	const first = results[0];
	const targetNames = [...indexed[0].keys()];
	for (let i = 1; i < results.length; i++) {
		if (results[i].suite !== first.suite || results[i].iterations !== first.iterations) {
			throw new Error(`run ${i + 1}: suite or iteration count changed`);
		}
		if (!sameNames(targetNames, [...indexed[i].keys()])) {
			throw new Error(`run ${i + 1}: target set changed`);
		}
		for (const name of targetNames) {
			if (
				!sameNames(Object.keys(indexed[0].get(name).ops), Object.keys(indexed[i].get(name).ops))
			) {
				throw new Error(`run ${i + 1}/${name}: operation set changed`);
			}
		}
	}

	const targets = targetNames.map((name) => ({
		name,
		ops: Object.fromEntries(
			Object.keys(indexed[0].get(name).ops).map((operation) => {
				const stats = indexed.map((run) => run.get(name).ops[operation]);
				const hasScore = Number.isFinite(stats[0].score);
				for (let i = 1; i < stats.length; i++) {
					if (Number.isFinite(stats[i].score) !== hasScore) {
						throw new Error(`run ${i + 1}/${name}/${operation}: score kind changed`);
					}
				}
				const scores = stats.map(scoreOf);
				const score = median(scores);
				const mean = scores.reduce((sum, value) => sum + value / scores.length, 0);
				const sd =
					scores.length > 1
						? Math.hypot(...scores.map((value) => value - mean)) / Math.sqrt(scores.length - 1)
						: 0;
				return [
					operation,
					{
						// PR reports distinguish timings from deterministic work counters
						// by the presence of a numeric score; preserve the input convention.
						...(hasScore ? { score } : {}),
						median: score,
						min: median(stats.map((stat) => stat.min)),
						scoreKind: 'run-median',
						betweenRuns: {
							scores,
							min: Math.min(...scores),
							max: Math.max(...scores),
							cvPercent: sd === 0 ? 0 : mean === 0 ? null : (sd / Math.abs(mean)) * 100,
						},
					},
				];
			}),
		),
	}));
	const failures = results.flatMap((result, i) => {
		if (result.failed) return [`run ${i + 1}: ${result.failed}`];
		if (result.harnessExit) return [`run ${i + 1}: harness exited ${result.harnessExit}`];
		return [];
	});
	return {
		suite: first.suite,
		iterations: first.iterations,
		repetitions: results.length,
		targets,
		harnessExit:
			results.find((result) => result.harnessExit)?.harnessExit ?? (failures.length ? 1 : 0),
		...(failures.length ? { failed: failures.join(' | ') } : {}),
		runs: results,
	};
}
