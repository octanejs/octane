import assert from 'node:assert/strict';

// Positional arguments name minimal-import scenarios by id (every bundler's
// build of it) or by name (one build). No argument selects every scenario.
export function selectMinimalScenarios(args, scenarios) {
	for (const argument of args) {
		assert.equal(
			scenarios.some(({ id, name }) => argument === id || argument === name),
			true,
			`Unknown minimal-import scenario: ${argument}`,
		);
	}
	const selectedScenarios = args.length
		? scenarios.filter(({ id, name }) => args.includes(id) || args.includes(name))
		: scenarios;
	assert.notEqual(selectedScenarios.length, 0, 'At least one minimal-import scenario must run');
	return selectedScenarios;
}
