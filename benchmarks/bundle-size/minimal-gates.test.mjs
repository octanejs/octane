import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { build } from 'esbuild';
import { parseAst } from 'vite';
import { bundleScenarios } from '../activity/bundle-scenarios.mjs';
import { selectMinimalScenarios, unreferencedMarkerDeclarations } from './minimal-gates.mjs';
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

test('late-folded marker declarations require a closed unused lexical group', () => {
	// Identity source map for the final output of a small bundle. The two
	// original ranges stand in for the narrow validators the gate audits.
	const map = {
		sources: ['/repo/packages/octane/src/protocol.ts'],
		mappings: 'AAAA;AACA;AACA;AACA;AACA',
	};
	const ranges = [
		{
			name: 'marker',
			source: 'protocol.ts',
			startLine: 1,
			startColumn: 0,
			endLine: 1,
			endColumn: 1000,
		},
		{
			name: 'multiplicity',
			source: 'protocol.ts',
			startLine: 2,
			startColumn: 0,
			endLine: 2,
			endColumn: 1000,
		},
	];
	const prove = (application) =>
		unreferencedMarkerDeclarations(
			`(function(){
function m(value){return value==="["}
function g(value){return m(value)?1:0}
${application}
})();`,
			map,
			parseAst,
			ranges,
		);
	assert.deepEqual(prove('globalThis.run=()=>42'), new Set(['marker', 'multiplicity']));
	// Minifiers reuse short names across lexical scopes; an actual shadow must
	// not prevent the proof. The outer binding must still be detected.
	assert.deepEqual(
		prove('globalThis.run=function(g){return g("[")}'),
		new Set(['marker', 'multiplicity']),
	);
	for (const application of [
		'globalThis.run=()=>g("[")',
		'globalThis.run=g',
		'globalThis.run={g}',
		'globalThis.run=()=>{const alias=g;return alias("[")}',
		'globalThis.run=()=>({call:m}).call("[")',
		'globalThis.run=function(g){return m(g)}',
		'globalThis.run=()=>eval("g")',
	])
		assert.deepEqual(prove(application), new Set(), application);
});

test('an inlined validator cannot receive unused-declaration credit', () => {
	const map = {
		sources: ['/repo/packages/octane/src/protocol.ts'],
		mappings: 'AAAA;AACA;AACA',
	};
	const ranges = [
		{
			name: 'marker',
			source: 'protocol.ts',
			startLine: 1,
			startColumn: 0,
			endLine: 1,
			endColumn: 1000,
		},
	];
	const code = '(function(){\nglobalThis.run=value=>value==="["\n})();';
	assert.deepEqual(unreferencedMarkerDeclarations(code, map, parseAst, ranges), new Set());
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
