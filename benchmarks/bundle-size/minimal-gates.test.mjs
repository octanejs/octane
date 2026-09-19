import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectMinimalScenarios, verifyByteBudget } from './minimal-gates.mjs';

const scenarios = [
	{ id: 'root-static', name: 'root-static' },
	{ id: 'behavior-root', name: 'behavior-root-vite' },
	{ id: 'behavior-root', name: 'behavior-root-esbuild' },
];

test('budget enforcement preserves default and grouped scenario selection', () => {
	assert.deepEqual(selectMinimalScenarios([], scenarios), {
		selectedScenarios: scenarios,
		enforceBudgets: false,
	});
	assert.deepEqual(selectMinimalScenarios(['--budgets', 'behavior-root'], scenarios), {
		selectedScenarios: scenarios.slice(1),
		enforceBudgets: true,
	});
	assert.deepEqual(selectMinimalScenarios(['behavior-root-esbuild', '--budgets'], scenarios), {
		selectedScenarios: [scenarios[2]],
		enforceBudgets: true,
	});
	assert.deepEqual(selectMinimalScenarios(['--budgets'], scenarios), {
		selectedScenarios: scenarios,
		enforceBudgets: true,
	});
});

test('invalid scenario arguments fail instead of silently skipping builds', () => {
	for (const argument of ['', 'unknown', '--budget']) {
		assert.throws(
			() => selectMinimalScenarios(['--budgets', argument], scenarios),
			(error) => error.message.startsWith(`Unknown minimal-import scenario: ${argument}`),
		);
	}
	assert.throws(() => selectMinimalScenarios([], []), /At least one minimal-import scenario/);
});

test('all three enforced byte ceilings allow equality and reject a one-byte overrun', () => {
	const budget = { raw: 100, gzip: 50, brotli: 40 };
	verifyByteBudget('example', budget, budget, true);
	for (const metric of ['raw', 'gzip', 'brotli']) {
		assert.throws(
			() => verifyByteBudget('example', { ...budget, [metric]: budget[metric] + 1 }, budget, true),
			new RegExp(
				`example: production ${metric} bytes ${budget[metric] + 1} exceed committed budget ${budget[metric]}`,
			),
		);
	}
});

test('report mode preserves oversized measurements for the paired ratio runner', () => {
	verifyByteBudget(
		'example',
		{ raw: 101, gzip: 51, brotli: 41 },
		{ raw: 100, gzip: 50, brotli: 40 },
		false,
	);
});

test('malformed committed ceilings fail in both report and enforcement modes', () => {
	for (const enforce of [false, true]) {
		for (const metric of ['raw', 'gzip', 'brotli']) {
			for (const value of [undefined, 0, -1, 0.5, NaN]) {
				assert.throws(
					() =>
						verifyByteBudget(
							'example',
							{ raw: 10, gzip: 5, brotli: 4 },
							{ raw: 100, gzip: 50, brotli: 40, [metric]: value },
							enforce,
						),
					new RegExp(`example: invalid committed ${metric} byte budget`),
				);
			}
		}
	}
});
