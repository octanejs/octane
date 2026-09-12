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
import { createEvidenceMatrix, inspectShippedSources } from './react-port/evidence-lib.mjs';

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

test('default expression adapters are observed through named re-exports', (t) => {
	const { root, write } = fixture(t);
	write('src/index.ts', "export * from 'engine'; export { default as useEngine } from './hook';");
	for (const source of [
		"import { memo } from 'octane'; export default memo(() => null);",
		"import { useEffect } from 'octane'; function useEngine() { useEffect(() => {}); } export default useEngine;",
		"import { useEffect } from 'octane'; const useEngine = () => { useEffect(() => {}); }; export default useEngine;",
		"import { useEffect } from 'octane'; const useEngine = () => { useEffect(() => {}); }; const adapter = useEngine; export default (adapter);",
		"import { useEffect as effect } from 'octane'; function useEngine() { effect(() => {}); } export default useEngine;",
		"import * as Octane from 'octane'; function useEngine() { Octane.useEffect(() => {}); } export default useEngine;",
		"import { useEffect } from 'octane'; function useEngine() { const hooks = { useEffect }; hooks.useEffect(() => {}); } export default useEngine;",
	]) {
		write('src/hook.ts', source);
		const policy = readBindingSurfacePolicy(root);
		assert.equal(policy.valid, true, policy.issues.join('\n'));
		assert.equal(policy.requiresLifecycleEvidence, true);
	}
});

test('default identifiers need ownership even alongside named exports', (t) => {
	const { root, write, surfaces } = fixture(t);
	write('package.json', { exports: { '.': './src/hook.ts' }, dependencies: { engine: '^1.0.0' } });
	const source =
		"import { useEffect } from 'octane'; export function useEngine() { useEffect(() => {}); } const value = 1; export default value;";
	write('src/hook.ts', source);
	write('status.json', { surfaces: [surfaces[1]] });
	let policy = readBindingSurfacePolicy(root);
	assert.equal(policy.valid, false);
	assert.ok(policy.issues.some((issue) => issue.includes('default: uncovered')));
	write('status.json', { surfaces: [{ ...surfaces[1], exports: ['useEngine', 'default'] }] });
	policy = readBindingSurfacePolicy(root);
	assert.equal(
		policy.valid,
		false,
		'a vanilla default cannot borrow integration from a named hook',
	);
	assert.ok(policy.issues.some((issue) => issue.includes('needs observed Octane integration')));
	write(
		'src/hook.ts',
		"import { useEffect } from 'octane'; export function useEngine() { useEffect(() => {}); } const a = b; const b = a; export default a;",
	);
	assert.equal(
		readBindingSurfacePolicy(root).valid,
		false,
		'circular aliases cannot establish integration',
	);
});

test('shadowed Octane names cannot authorize adapter ownership', (t) => {
	const { root, write } = fixture(t);
	for (const declaration of [
		'function useEngine(useEffect) { return 1; }',
		'function useEngine(useEffect) { return useEffect(); }',
		'const useEngine = function useEffect() { return 1; };',
		'function useEffect() { return 1; } const useEngine = useEffect;',
		'function useEngine() { const useEffect = () => 1; return useEffect(); }',
		'function useEngine() { return { useEffect: 1 }; }',
	]) {
		for (const exportDefault of [false, true]) {
			write(
				'src/index.ts',
				`export * from 'engine'; export { ${exportDefault ? 'default as ' : ''}useEngine } from './hook';`,
			);
			write(
				'src/hook.ts',
				`import { useEffect } from 'octane'; ${exportDefault ? `${declaration} export default useEngine;` : declaration.replace(/\b(function|const) useEngine/, 'export $1 useEngine')}`,
			);
			const policy = readBindingSurfacePolicy(root);
			assert.equal(policy.valid, false, declaration);
			assert.ok(
				policy.issues.some((issue) => issue.includes('needs observed Octane integration')),
				policy.issues.join('\n'),
			);
			assert.equal(policy.requiresCopiedEvidence, true);
		}
	}
});

test('local export stars exclude defaults and CommonJS assignments require explicit review', (t) => {
	const { root, write } = fixture(t);
	write(
		'src/hook.ts',
		"import { useEffect } from 'octane'; export function useEngine() { useEffect(() => {}); } export default 1;",
	);
	write('src/index.ts', "export * from 'engine'; export * from './hook';");
	assert.equal(readBindingSurfacePolicy(root).valid, true);
	write(
		'src/hook.ts',
		"import { useEffect } from 'octane'; export function useEngine() { useEffect(() => {}); } export = useEngine;",
	);
	const policy = readBindingSurfacePolicy(root);
	assert.equal(policy.valid, false);
	assert.ok(
		policy.issues.some((issue) => issue.includes('CommonJS export assignment requires review')),
	);
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

function copiedFixture(t) {
	const state = fixture(t);
	const source = 'export function copied() { return 1; }\n';
	state.write('src/copied.js', source);
	state.write('audit/source-ledger.json', [
		{
			path: 'src/copied.js',
			origin: 'adapted',
			packageName: 'react-engine',
			sha256: createHash('sha256').update(source).digest('hex'),
		},
	]);
	return state;
}

test('lazy and CommonJS loads cannot hide copied implementation behind an adapter', (t) => {
	const { root, write, surfaces } = copiedFixture(t);
	assert.equal(readBindingSurfacePolicy(root).valid, true);
	for (const [setup, load] of [
		['', "void import('./copied.js').then(({ copied }) => copied())"],
		['', 'void import(`./copied.js`).then(({ copied }) => copied())'],
		['', "require('./copied.js').copied()"],
		["import copiedModule = require('./copied.js');", 'copiedModule.copied()'],
	]) {
		write(
			'src/hook.ts',
			`import { useEffect } from 'octane';\n${setup}\nexport function useEngine() { useEffect(() => { ${load}; }); }\n`,
		);
		write('status.json', { surfaces });
		assert.ok(inspectShippedSources(root).files.includes('src/copied.js'));
		const policy = readBindingSurfacePolicy(root);
		assert.equal(policy.valid, false, load);
		assert.ok(policy.issues.some((issue) => issue.includes('src/copied.js has no owner')));
		assert.equal(policy.requiresCopiedEvidence, true);
		assert.equal(requiresUpstreamEvidence(policy, 'react-engine'), true);
		assert.throws(
			() =>
				createEvidenceMatrix({
					categories: ['hooks-store'],
					preflightArtifact: 'audit/preflight.json',
					surfacePolicy: policy,
				}),
			/Invalid binding surface policy cannot relax evidence/,
		);
		write('status.json', {
			surfaces: [surfaces[0], { ...surfaces[1], files: ['src/hook.ts', 'src/copied.js'] }],
		});
		assert.ok(
			readBindingSurfacePolicy(root).issues.some((issue) =>
				issue.includes('source ledger conflicts with adapter ownership'),
			),
		);
	}
});

test('every package import condition needs ownership before copied evidence can be waived', (t) => {
	const { root, write, surfaces } = copiedFixture(t);
	write('package.json', {
		exports: { '.': './src/index.ts' },
		imports: { '#engine': { browser: './src/browser.js', default: './src/copied.js' } },
		dependencies: { engine: '^1.0.0' },
		peerDependencies: { octane: '*' },
	});
	write('src/browser.js', 'export function copied() { return 0; }\n');
	for (const [setup, load] of [
		["import { copied } from '#engine';", 'copied()'],
		['', "void import('#engine').then(({ copied }) => copied())"],
	]) {
		write(
			'src/hook.ts',
			`import { useEffect } from 'octane';\n${setup}\nexport function useEngine() { useEffect(() => { ${load}; }); }\n`,
		);
		const policy = readBindingSurfacePolicy(root);
		assert.equal(policy.valid, false);
		for (const file of ['src/browser.js', 'src/copied.js']) {
			assert.ok(inspectShippedSources(root).files.includes(file));
			assert.ok(policy.issues.some((issue) => issue.includes(`${file} has no owner`)));
		}
		assert.equal(requiresUpstreamEvidence(policy, 'react-engine'), true);
		assert.throws(
			() =>
				createEvidenceMatrix({
					categories: ['hooks-store'],
					preflightArtifact: 'audit/preflight.json',
					surfacePolicy: policy,
				}),
			/Invalid binding surface policy cannot relax evidence/,
		);
	}
	write(
		'src/index.ts',
		"export * from 'engine';\nexport { useEngine } from './hook';\nexport { copied } from '#engine';\n",
	);
	const browserSource = 'export function copied() { return 0; }\n';
	write('audit/source-ledger.json', [
		...['src/browser.js', 'src/copied.js'].map((file) => ({
			path: file,
			origin: 'adapted',
			packageName: 'react-engine',
			sha256: createHash('sha256')
				.update(
					file === 'src/browser.js' ? browserSource : 'export function copied() { return 1; }\n',
				)
				.digest('hex'),
		})),
	]);
	write('status.json', {
		surfaces: [
			...surfaces,
			{
				entrypoint: '.',
				exports: ['copied'],
				ownership: 'copied',
				files: ['src/browser.js', 'src/copied.js'],
				dependency: { package: 'react-engine', version: '1.0.0' },
				upstreamPaths: ['src/copied'],
				evidence: ['tests/consumer.test.ts'],
			},
		],
	});
	const policy = readBindingSurfacePolicy(root);
	assert.equal(policy.valid, true, policy.issues.join('\n'));
	const matrix = createEvidenceMatrix({
		categories: ['hooks-store'],
		preflightArtifact: 'audit/preflight.json',
		surfacePolicy: policy,
	});
	for (const gate of ['upstream-crosswalk', 'upstream-types-pristine', 'upstream-types-adapted'])
		assert.equal(matrix.gates[gate].status, 'required');
});

test('unresolved and computed module loads cannot waive upstream evidence', (t) => {
	const { root, write } = fixture(t);
	for (const load of [
		"import('./missing.js')",
		"require('./missing.js')",
		"import('#missing')",
		'import(globalThis.engineModule)',
		'require(globalThis.engineModule)',
	]) {
		write(
			'src/hook.ts',
			`import { useEffect } from 'octane';\nexport function useEngine() { useEffect(() => { void ${load}; }); }\n`,
		);
		const policy = readBindingSurfacePolicy(root);
		assert.equal(policy.valid, false, load);
		assert.equal(policy.requiresCopiedEvidence, true, load);
	}
});

test('dependency aliases and associated adapter types retain focused evidence', (t) => {
	const { root, write, surfaces } = fixture(t);
	write('package.json', {
		exports: { '.': './src/index.ts' },
		imports: { '#engine': 'engine' },
		dependencies: { engine: '^1.0.0' },
		peerDependencies: { octane: '*' },
	});
	write(
		'src/index.ts',
		"export * from '#engine';\nexport { useEngine, type Options } from './hook';\n",
	);
	write('src/options.ts', 'export interface Options { enabled: boolean; }\n');
	write(
		'src/hook.ts',
		"import { useEffect } from 'octane';\nimport type { Options } from './options';\nexport type { Options } from './options';\nexport function useEngine(options: Options) { useEffect(() => { if (options.enabled) return () => {}; }); }\n",
	);
	write('status.json', {
		surfaces: [
			surfaces[0],
			{
				...surfaces[1],
				exports: ['useEngine', 'Options'],
				files: ['src/hook.ts', 'src/options.ts'],
			},
		],
	});
	const policy = readBindingSurfacePolicy(root);
	assert.equal(policy.valid, true, policy.issues.join('\n'));
	assert.equal(policy.requiresCopiedEvidence, false);
	assert.equal(policy.requiresLifecycleEvidence, true);
});

test('parses generic arrows in TypeScript source without treating them as JSX', (t) => {
	const { root, write } = fixture(t);
	write(
		'src/hook.ts',
		"import { useEffect } from 'octane';\nconst identity = <T>(value: T) => value;\nexport function useEngine() { useEffect(() => { identity(1); }); }\n",
	);
	const policy = readBindingSurfacePolicy(root);
	assert.equal(policy.valid, true, policy.issues.join('\n'));
});
