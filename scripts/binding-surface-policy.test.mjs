import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	readBindingSurfacePolicy,
	requiresUpstreamEvidence,
	scopeUpstreamInventory,
} from './binding-surface-policy.mjs';

function fixture(t) {
	const root = mkdtempSync(path.join(tmpdir(), 'binding-surfaces-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const write = (file, value) => {
		mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value));
	};
	write('package.json', {
		exports: { '.': './src/index.ts' },
		dependencies: { engine: '^1.0.0' },
		peerDependencies: { octane: '*' },
	});
	write('src/index.ts', "export * from 'engine';\nexport { useEngine } from './hook';\n");
	write(
		'src/hook.ts',
		"import { useEffect } from 'octane';\nexport function useEngine() { useEffect(() => () => {}); }\n",
	);
	write('tests/consumer.test.ts', "test('consumer identity and cleanup', () => {});\n");
	const surfaces = [
		{
			entrypoint: '.',
			exports: ['*'],
			ownership: 'imported',
			files: ['src/index.ts'],
			dependency: { package: 'engine', version: '^1.0.0', specifier: 'engine' },
			evidence: ['tests/consumer.test.ts'],
		},
		{
			entrypoint: '.',
			exports: ['useEngine'],
			ownership: 'adapter',
			files: ['src/hook.ts'],
			dependency: { package: 'engine', version: '^1.0.0' },
			evidence: ['tests/consumer.test.ts'],
		},
	];
	write('status.json', { surfaces });
	return { root, write, surfaces };
}

test('observed dependency and hook exports keep focused evidence without engine suites', (t) => {
	const { root } = fixture(t);
	const policy = readBindingSurfacePolicy(root);
	assert.equal(policy.valid, true, policy.issues.join('\n'));
	assert.equal(policy.requiresLifecycleEvidence, true);
	assert.equal(requiresUpstreamEvidence(policy), false);
	assert.deepEqual(scopeUpstreamInventory(policy, [{ path: 'tests/engine.test.ts' }]), []);
});

test('legacy packages keep upstream evidence and reads do not promote metadata', (t) => {
	const { root, write } = fixture(t);
	write('status.json', { verified: '2025-01-01' });
	const policy = readBindingSurfacePolicy(root);
	assert.equal(policy.mode, 'legacy');
	assert.equal(requiresUpstreamEvidence(policy), true);
});

test('uncovered, conflicting, missing, and asserted exports fail closed', (t) => {
	const { root, write, surfaces } = fixture(t);
	for (const invalid of [
		surfaces.slice(0, 1),
		[...surfaces, surfaces[0]],
		[{ ...surfaces[0], exports: ['fake'] }, surfaces[1]],
		[{ ...surfaces[0], dependency: { package: 'engine', version: '^2.0.0' } }, surfaces[1]],
	]) {
		write('status.json', { surfaces: invalid });
		const policy = readBindingSurfacePolicy(root);
		assert.equal(policy.valid, false);
		assert.equal(requiresUpstreamEvidence(policy), true);
	}
	write('status.json', { surfaces });
	assert.equal(
		readBindingSurfacePolicy(root, {
			sourceLedger: [{ path: 'src/hook.ts', origin: 'adapted', packageName: 'react-engine' }],
		}).valid,
		false,
	);
	write('src/index.ts', 'export function engine() { return 1; }');
	assert.equal(readBindingSurfacePolicy(root).valid, false);
});

test('mixed copied implementation retains only its dependency and scoped upstream inventory', (t) => {
	const { root, write, surfaces } = fixture(t);
	write(
		'src/index.ts',
		"export * from 'engine';\nexport { useEngine } from './hook';\nexport { copied } from './copied';\n",
	);
	write('src/copied.ts', 'export function copied() { return 1; }');
	write('audit/source-ledger.json', [
		{
			path: 'src/copied.ts',
			origin: 'adapted',
			packageName: 'react-engine',
			sha256: createHash('sha256').update('export function copied() { return 1; }').digest('hex'),
		},
	]);
	surfaces.push({
		entrypoint: '.',
		exports: ['copied'],
		ownership: 'copied',
		files: ['src/copied.ts'],
		dependency: { package: 'react-engine', version: '1.0.0' },
		upstreamPaths: ['src/copied', 'tests/copied'],
		evidence: ['tests/consumer.test.ts'],
	});
	write('status.json', { surfaces });
	const policy = readBindingSurfacePolicy(root);
	assert.equal(policy.valid, true, policy.issues.join('\n'));
	assert.equal(requiresUpstreamEvidence(policy, 'engine'), false);
	assert.equal(requiresUpstreamEvidence(policy, 'react-engine'), true);
	assert.deepEqual(
		scopeUpstreamInventory(policy, [
			{ path: 'tests/engine.test.ts' },
			{ path: 'tests/copied/works.test.ts' },
		]),
		[{ path: 'tests/copied/works.test.ts' }],
	);
	assert.throws(
		() => scopeUpstreamInventory(policy, [{ path: 'tests/unmatched.test.ts' }]),
		/match no pinned/,
	);
	write('audit/source-ledger.json', []);
	assert.equal(readBindingSurfacePolicy(root).valid, false);
});

test('side effects and hidden local implementations cannot claim dependency-only evidence', (t) => {
	const { root, write } = fixture(t);
	write('src/hidden.ts', 'globalThis.engineOverride = () => 1;');
	for (const prefix of ["import './hidden';\n", 'globalThis.engineOverride = () => 1;\n']) {
		write(
			'src/index.ts',
			`${prefix}export * from 'engine';\nexport { useEngine } from './hook';\n`,
		);
		const policy = readBindingSurfacePolicy(root);
		assert.equal(policy.valid, false);
		assert.equal(requiresUpstreamEvidence(policy), true);
	}
});

test('a forwarding ancestor cannot hide owned side effects behind an imported leaf', (t) => {
	const { root, write, surfaces } = fixture(t);
	write('src/forward.ts', "export * from 'engine';\n");
	write('src/index.ts', "globalThis.engineOverride = () => 1;\nexport * from './forward';\n");
	write('status.json', {
		surfaces: [{ ...surfaces[0], files: ['src/index.ts', 'src/forward.ts'] }],
	});
	const policy = readBindingSurfacePolicy(root);
	assert.equal(policy.valid, false);
	assert.equal(requiresUpstreamEvidence(policy), true);
});

test('adapter ownership requires runtime Octane integration in the selected surface', (t) => {
	const { root, write, surfaces } = fixture(t);
	write(
		'src/hook.ts',
		"import type { OctaneNode } from 'octane';\nexport function useEngine() { return 1; }\n",
	);
	assert.equal(readBindingSurfacePolicy(root).valid, false);
	write('src/hook.ts', 'export function useEngine() { return 1; }\n');
	write(
		'src/sibling.ts',
		"import { useEffect } from 'octane';\nexport function useSibling() { useEffect(() => {}); }\n",
	);
	write(
		'src/index.ts',
		"export * from 'engine';\nexport { useEngine } from './hook';\nexport { useSibling } from './sibling';\n",
	);
	write('status.json', {
		surfaces: [...surfaces, { ...surfaces[1], exports: ['useSibling'], files: ['src/sibling.ts'] }],
	});
	assert.equal(readBindingSurfacePolicy(root).valid, false);
});

test('one hook cannot authorize a separate vanilla implementation in the same adapter declaration', (t) => {
	const { root, write, surfaces } = fixture(t);
	write('src/localEngine.ts', 'export function localEngine() { return 1; }\n');
	write(
		'src/index.ts',
		"export * from 'engine';\nexport { useEngine } from './hook';\nexport { localEngine } from './localEngine';\n",
	);
	write('status.json', {
		surfaces: [
			surfaces[0],
			{
				...surfaces[1],
				exports: ['useEngine', 'localEngine'],
				files: ['src/hook.ts', 'src/localEngine.ts'],
			},
		],
	});
	assert.equal(readBindingSurfacePolicy(root).valid, false);
	write(
		'src/hook.ts',
		"import { useEffect } from 'octane';\nexport const useEngine = () => useEffect(() => {}), localEngine = () => 1;\n",
	);
	write(
		'src/index.ts',
		"export * from 'engine';\nexport { useEngine, localEngine } from './hook';\n",
	);
	write('status.json', {
		surfaces: [surfaces[0], { ...surfaces[1], exports: ['useEngine', 'localEngine'] }],
	});
	assert.equal(readBindingSurfacePolicy(root).valid, false);
});
