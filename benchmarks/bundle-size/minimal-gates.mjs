import assert from 'node:assert/strict';

export function selectMinimalScenarios(args, scenarios) {
	const enforceBudgets = args.includes('--budgets');
	const requested = args.filter((argument) => argument !== '--budgets');
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
	return { selectedScenarios, enforceBudgets };
}

export function verifyByteBudget(name, measured, budget, enforce) {
	for (const metric of ['raw', 'gzip', 'brotli']) {
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
