import assert from 'node:assert/strict';

// Every committed byte budget is a ratchet: the measured production bytes plus
// this headroom. Raw and gzip are the growth gate: a change that grows either by
// more than 32 bytes fails CI, and the budget is raised only in a separate pull
// request that names the bytes and the reason (CONTRIBUTING.md, "Size budgets").
// Brotli is not monotonic in code size; removing code has raised it by 120 bytes
// (#1634), so it keeps 256 bytes and still catches real compressed growth.
export const BUDGET_HEADROOM_BYTES = Object.freeze({ raw: 32, gzip: 32, brotli: 256 });
export const BYTE_METRICS = ['raw', 'gzip', 'brotli'];

// Records a budget the way a ratchet moves: each metric drops to measured +
// headroom when that is lower, stays where the measurement still fits, and rises
// only when the measurement exceeds it. So rewriting budgets after a change that
// saved bytes never raises one (brotli can grow when code is removed), and only
// a real breach produces a raise, which then lands in its own pull request.
export function ratchetBudget(measured, current) {
	return Object.fromEntries(
		BYTE_METRICS.map((metric) => {
			assert.equal(
				Number.isSafeInteger(measured[metric]) && measured[metric] > 0,
				true,
				`cannot derive a ${metric} budget from ${measured[metric]}`,
			);
			const fresh = measured[metric] + BUDGET_HEADROOM_BYTES[metric];
			const previous = current?.[metric];
			return [
				metric,
				Number.isSafeInteger(previous) && measured[metric] <= previous
					? Math.min(previous, fresh)
					: fresh,
			];
		}),
	);
}

export function selectMinimalScenarios(args, scenarios) {
	const enforceBudgets = args.includes('--budgets');
	const writeBudgets = args.includes('--write-budgets');
	assert.equal(
		enforceBudgets && writeBudgets,
		false,
		'--budgets checks the committed budgets and --write-budgets replaces them; pass one',
	);
	const requested = args.filter(
		(argument) => argument !== '--budgets' && argument !== '--write-budgets',
	);
	for (const argument of requested) {
		assert.equal(
			scenarios.some(({ id, name }) => argument === id || argument === name),
			true,
			`Unknown minimal-import scenario: ${argument}`,
		);
	}
	const selectedScenarios = requested.length
		? scenarios.filter(({ id, name }) => requested.includes(id) || requested.includes(name))
		: scenarios;
	assert.notEqual(selectedScenarios.length, 0, 'At least one minimal-import scenario must run');
	return { selectedScenarios, enforceBudgets, writeBudgets };
}

export function verifyByteBudget(name, measured, budget, enforce) {
	for (const metric of BYTE_METRICS) {
		assert.equal(
			Number.isSafeInteger(budget[metric]) && budget[metric] > 0,
			true,
			`${name}: invalid committed ${metric} byte budget`,
		);
		if (enforce) {
			assert.equal(
				measured[metric] <= budget[metric],
				true,
				`${name}: production ${metric} bytes ${measured[metric]} exceed committed budget ${budget[metric]}`,
			);
		}
	}
}
