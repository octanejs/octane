import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { build } from 'esbuild';
import { bundleScenarios } from '../activity/bundle-scenarios.mjs';
import { selectMinimalScenarios } from './minimal-gates.mjs';
import { verifyScenario } from './verify-reachability.mjs';

const scenarios = [
	{ id: 'root-static', name: 'root-static' },
	{ id: 'behavior-root', name: 'behavior-root-vite' },
	{ id: 'behavior-root', name: 'behavior-root-esbuild' },
];

test('scenario selection accepts every scenario, a shared id, or one name', () => {
	assert.deepEqual(selectMinimalScenarios([], scenarios), scenarios);
	assert.deepEqual(selectMinimalScenarios(['behavior-root'], scenarios), scenarios.slice(1));
	assert.deepEqual(selectMinimalScenarios(['behavior-root-esbuild'], scenarios), [scenarios[2]]);
	assert.deepEqual(selectMinimalScenarios(['root-static'], scenarios), scenarios.slice(0, 1));
});

test('invalid scenario arguments fail instead of silently skipping builds', () => {
	for (const argument of ['', 'unknown', '--budgets']) {
		assert.throws(
			() => selectMinimalScenarios([argument], scenarios),
			(error) => error.message.startsWith(`Unknown minimal-import scenario: ${argument}`),
		);
	}
	assert.throws(() => selectMinimalScenarios([], []), /At least one minimal-import scenario/);
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
