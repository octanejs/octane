import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { build } from 'esbuild';
import { bundleScenarios } from '../activity/bundle-scenarios.mjs';
import { ratchetBudget, selectMinimalScenarios, verifyByteBudget } from './minimal-gates.mjs';
import { verifyScenario } from './verify-reachability.mjs';

const scenarios = [
	{ id: 'root-static', name: 'root-static' },
	{ id: 'behavior-root', name: 'behavior-root-vite' },
	{ id: 'behavior-root', name: 'behavior-root-esbuild' },
];

test('budget enforcement preserves default and grouped scenario selection', () => {
	assert.deepEqual(selectMinimalScenarios([], scenarios), {
		selectedScenarios: scenarios,
		enforceBudgets: false,
		writeBudgets: false,
	});
	assert.deepEqual(selectMinimalScenarios(['--budgets', 'behavior-root'], scenarios), {
		selectedScenarios: scenarios.slice(1),
		enforceBudgets: true,
		writeBudgets: false,
	});
	assert.deepEqual(selectMinimalScenarios(['behavior-root-esbuild', '--budgets'], scenarios), {
		selectedScenarios: [scenarios[2]],
		enforceBudgets: true,
		writeBudgets: false,
	});
	assert.deepEqual(selectMinimalScenarios(['--budgets'], scenarios), {
		selectedScenarios: scenarios,
		enforceBudgets: true,
		writeBudgets: false,
	});
	assert.deepEqual(selectMinimalScenarios(['--write-budgets', 'root-static'], scenarios), {
		selectedScenarios: scenarios.slice(0, 1),
		enforceBudgets: false,
		writeBudgets: true,
	});
});

test('checking and rewriting budgets in one run is rejected', () => {
	assert.throws(
		() => selectMinimalScenarios(['--budgets', '--write-budgets'], scenarios),
		/pass one/,
	);
});

// Brotli can grow when code is removed, so only raw and gzip get the tight gate.
test('a rewritten budget is the measurement plus 32 raw and gzip bytes and 256 brotli bytes', () => {
	assert.deepEqual(ratchetBudget({ raw: 1000, gzip: 400, brotli: 350 }), {
		raw: 1032,
		gzip: 432,
		brotli: 606,
	});
	assert.throws(() => ratchetBudget({ raw: 1000, gzip: 0, brotli: 350 }), /gzip budget/);
});

test('rewriting a budget lowers it, keeps it when the measurement fits, and raises only a breach', () => {
	const current = { raw: 1032, gzip: 432, brotli: 606 };
	// Code removed: raw and gzip shrink, brotli grows but still fits its budget.
	assert.deepEqual(ratchetBudget({ raw: 900, gzip: 380, brotli: 470 }, current), {
		raw: 932,
		gzip: 412,
		brotli: 606,
	});
	// Unchanged bytes rewrite to the same budget.
	assert.deepEqual(ratchetBudget({ raw: 1000, gzip: 400, brotli: 350 }, current), current);
	// Only the breached metric rises, to measured + headroom.
	assert.deepEqual(ratchetBudget({ raw: 1040, gzip: 400, brotli: 350 }, current), {
		raw: 1072,
		gzip: 432,
		brotli: 606,
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

test('the Activity descriptor audit retains its distinct public output contract', async () => {
	const [name, request, oracle = name] = bundleScenarios.find(([id]) => id === 'root-descriptor');
	const result = await build({
		entryPoints: [path.resolve(import.meta.dirname, '../activity', request)],
		bundle: true,
		write: false,
		minify: true,
		format: 'iife',
		globalName: '__OCTANE_REACHABILITY__',
		platform: 'browser',
		target: 'esnext',
		tsconfigRaw: { compilerOptions: {} },
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	});
	const code = result.outputFiles[0].text;
	assert.deepEqual(await verifyScenario(oracle, code), { text: 'Octane', cleaned: true });
	await assert.rejects(() => verifyScenario('root-static', code), /changed observable behavior/);
});
