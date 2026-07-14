import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
	OCTANE_RUNTIME_REQUESTS,
	canonicalModuleId,
	createOctaneCompiler,
	resolveOctaneRuntimeRequest,
} from '../src/compiler/bundler.js';

const COMPONENT =
	"import { useState } from 'octane';\n" +
	'export function App() @{\n' +
	'  const [count] = useState(0);\n' +
	'  <p>{count as string}</p>\n' +
	'}\n';

const HOOK =
	"import { useState } from 'octane';\n" + 'export function useCount() { return useState(0); }\n';

describe('bundler-neutral compiler integration', () => {
	it('canonicalizes root files and strips bundler queries', () => {
		const root = resolve('/project');
		expect(canonicalModuleId(resolve(root, 'src/App.tsrx') + '?v=1#used', root)).toBe(
			'/src/App.tsrx',
		);
		expect(canonicalModuleId(resolve('/external/App.tsrx') + '?raw', root)).toBe(
			resolve('/external/App.tsrx'),
		);
		expect(canonicalModuleId(String.raw`C:\external\App.tsrx`, String.raw`C:\project`)).toBe(
			'C:/external/App.tsrx',
		);
	});

	it('compiles the same source for client and server with maps', () => {
		const compiler = createOctaneCompiler({ root: '/project' });
		const client = compiler.transform(COMPONENT, '/project/src/App.tsrx?v=1', {
			environment: 'client',
			hmr: 'vite',
		});
		expect(client?.kind).toBe('compile');
		expect(client?.code).toContain('import.meta.hot.accept');
		expect(client?.code).toContain('octane:/src/App.tsrx:App.useState#0');
		expect(client?.map.sourcesContent).toEqual([COMPONENT]);

		const server = compiler.transform(COMPONENT, '/project/src/App.tsrx?ssr', {
			environment: 'server',
			hmr: 'webpack',
		});
		expect(server?.kind).toBe('compile');
		expect(server?.code).toContain("from 'octane/server'");
		expect(server?.code).not.toContain('webpackHot');
	});

	it('specializes profiling for client transforms independently of dev and HMR', () => {
		const compiler = createOctaneCompiler({ root: '/project', profile: true });
		const client = compiler.transform(COMPONENT, '/project/src/App.tsrx', {
			environment: 'client',
			hmr: false,
			dev: false,
		});
		expect(client?.code).toContain('__profileComponent');
		expect(client?.code).toContain('"id":"/src/App.tsrx#App@2:7"');
		expect(client?.code).not.toContain('__s.locs');

		const disabled = compiler.transform(COMPONENT, '/project/src/App.tsrx', {
			environment: 'client',
			profile: false,
		});
		expect(disabled?.code).not.toContain('__profile');

		const server = compiler.transform(COMPONENT, '/project/src/App.tsrx', {
			environment: 'server',
			profile: true,
		});
		expect(server?.code).not.toContain('__profile');
	});

	it('exposes exact client/server runtime request mapping', () => {
		expect(OCTANE_RUNTIME_REQUESTS).toEqual({ client: 'octane', server: 'octane/server' });
		expect(resolveOctaneRuntimeRequest('octane', 'client')).toBe('octane');
		expect(resolveOctaneRuntimeRequest('octane', 'server')).toBe('octane/server');
		expect(resolveOctaneRuntimeRequest('octane/server', 'server')).toBeNull();
	});

	it('returns manifest watch metadata for transforms and pass-through decisions', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-bundler-transform-'));
		try {
			writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }));
			const packageRoot = join(root, 'node_modules/raw-octane');
			mkdirSync(join(packageRoot, 'src'), { recursive: true });
			const manifest = join(packageRoot, 'package.json');
			writeFileSync(
				manifest,
				JSON.stringify({
					name: 'raw-octane',
					peerDependencies: { octane: '*' },
					octane: { hookSlots: { manual: ['src/manual'] } },
				}),
			);

			const compiler = createOctaneCompiler({ root });
			const tsx = compiler.transform(
				`export function App() { return <p>{'raw'}</p>; }`,
				join(packageRoot, 'src/App.tsx?used'),
			);
			expect(tsx?.kind).toBe('compile');
			expect(tsx?.dependencies).toContain(manifest);

			const manual = compiler.transform(HOOK, join(packageRoot, 'src/manual/useCount.ts'));
			expect(manual).toMatchObject({ kind: 'none', code: HOOK, map: null });
			expect(manual?.dependencies).toContain(manifest);

			const unrelatedRoot = join(root, 'node_modules/unrelated');
			mkdirSync(join(unrelatedRoot, 'src'), { recursive: true });
			const unrelatedManifest = join(unrelatedRoot, 'package.json');
			writeFileSync(unrelatedManifest, JSON.stringify({ name: 'unrelated' }));
			const unrelated = compiler.transform(
				`export function App() { return <p/>; }`,
				join(unrelatedRoot, 'src/App.tsx'),
			);
			expect(unrelated?.kind).toBe('none');
			expect(unrelated?.dependencies).toContain(unrelatedManifest);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('classifies symlink-resolved packages by their nearest manifest', () => {
		const fixtureRoot = mkdtempSync(join(tmpdir(), 'octane-bundler-linked-'));
		try {
			const root = join(fixtureRoot, 'app');
			const modules = join(root, 'node_modules');
			mkdirSync(modules, { recursive: true });
			writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }));

			const createLinkedPackage = (name: string, usesOctane: boolean) => {
				const packageRoot = join(fixtureRoot, name);
				mkdirSync(join(packageRoot, 'src'), { recursive: true });
				const manifest = join(packageRoot, 'package.json');
				writeFileSync(
					manifest,
					JSON.stringify({
						name,
						...(usesOctane ? { peerDependencies: { octane: '*' } } : {}),
					}),
				);
				const source = join(packageRoot, 'src/App.tsx');
				writeFileSync(source, `export function App() { return <p>${name}</p>; }\n`);
				symlinkSync(packageRoot, join(modules, name), 'dir');
				return {
					manifest: realpathSync(manifest),
					source: realpathSync(join(modules, name, 'src/App.tsx')),
				};
			};

			const unrelated = createLinkedPackage('linked-unrelated', false);
			const rawOctane = createLinkedPackage('linked-octane', true);
			const compiler = createOctaneCompiler({ root });

			const skipped = compiler.transform(
				`export function App() { return <p>unrelated</p>; }`,
				unrelated.source,
			);
			expect(skipped).toMatchObject({ kind: 'none' });
			expect(skipped?.dependencies).toContain(unrelated.manifest);

			const compiled = compiler.transform(
				`export function App() { return <p>octane</p>; }`,
				rawOctane.source,
			);
			expect(compiled?.kind).toBe('compile');
			expect(compiled?.code).toContain('_$template("<p>octane</p>")');
			expect(compiled?.dependencies).toContain(rawOctane.manifest);
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	});

	it('uses portable profile source IDs and redacts arbitrary external paths', () => {
		const fixtureRoot = mkdtempSync(join(tmpdir(), 'octane-profile-source-'));
		try {
			const projectRoot = join(fixtureRoot, 'project');
			const sourceRoot = join(projectRoot, 'src');
			mkdirSync(sourceRoot, { recursive: true });
			writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'app' }));
			const linkedRoot = join(fixtureRoot, 'linked-project');
			symlinkSync(projectRoot, linkedRoot, 'dir');
			const realProjectRoot = realpathSync(projectRoot);

			const compiler = createOctaneCompiler({ root: linkedRoot, profile: true });
			const app = compiler.transform(COMPONENT, join(realProjectRoot, 'src/App.tsrx'));
			expect(app?.code).toContain('"file":"/src/App.tsrx"');
			expect(app?.code).not.toContain(realProjectRoot);
			expect(app?.code).not.toContain(resolve(linkedRoot));

			const packageRoot = join(fixtureRoot, 'shared-ui');
			mkdirSync(join(packageRoot, 'src'), { recursive: true });
			writeFileSync(
				join(packageRoot, 'package.json'),
				JSON.stringify({ name: '@scope/ui', peerDependencies: { octane: '*' } }),
			);
			const packaged = compiler.transform(COMPONENT, join(packageRoot, 'src/Card.tsx'));
			expect(packaged?.code).toContain('"file":"/@package/%40scope%2Fui/src/Card.tsx"');
			expect(packaged?.code).not.toContain(packageRoot);
			const packagedHook = compiler.transform(HOOK, join(packageRoot, 'src/useCount.ts'));
			expect(packagedHook?.code).toContain('"file":"/@package/%40scope%2Fui/src/useCount.ts"');
			expect(packagedHook?.code).not.toContain(packageRoot);

			const externalRoot = join(fixtureRoot, 'unowned');
			mkdirSync(externalRoot);
			const external = compiler.transform(COMPONENT, join(externalRoot, 'Loose.tsrx'));
			expect(external?.code).toContain('"file":"/@external/Loose.tsrx"');
			expect(external?.code).not.toContain(externalRoot);
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	});

	it('reports missing manifests and refreshes instance caches on invalidate', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-bundler-invalidate-'));
		try {
			writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }));
			const sourceDir = join(root, 'src/hooks');
			mkdirSync(sourceDir, { recursive: true });
			const id = join(sourceDir, 'useCount.ts');
			const compiler = createOctaneCompiler({ root });

			const first = compiler.transform(HOOK, id);
			expect(first?.kind).toBe('slots');
			expect(first?.missingDependencies).toContain(join(sourceDir, 'package.json'));

			const sourceManifest = join(root, 'src/package.json');
			writeFileSync(
				sourceManifest,
				JSON.stringify({
					name: 'manual-hooks',
					dependencies: { octane: '*' },
					octane: { hookSlots: { manual: ['hooks'] } },
				}),
			);
			// Cached nearest-manifest decisions are stable until the bundler reports
			// a watched change.
			expect(compiler.transform(HOOK, id)?.kind).toBe('slots');
			compiler.invalidate(sourceManifest);
			const refreshed = compiler.transform(HOOK, id);
			expect(refreshed?.kind).toBe('none');
			expect(refreshed?.dependencies).toContain(sourceManifest);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('discovers raw Octane packages with existing and missing dependency metadata', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-bundler-discovery-'));
		try {
			const projectManifest = join(root, 'package.json');
			writeFileSync(
				projectManifest,
				JSON.stringify({ name: 'app', dependencies: { 'raw-octane': '1.0.0' } }),
			);
			const packageRoot = join(root, 'node_modules/raw-octane');
			mkdirSync(packageRoot, { recursive: true });
			const packageManifest = join(packageRoot, 'package.json');
			writeFileSync(
				packageManifest,
				JSON.stringify({
					name: 'raw-octane',
					main: 'index.js',
					peerDependencies: { octane: '*' },
					optionalDependencies: { 'missing-child': '1.0.0' },
				}),
			);
			writeFileSync(join(packageRoot, 'index.js'), 'export const value = 1;\n');

			const discovered = createOctaneCompiler({ root }).discoverSourceDependencies();
			const resolvedPackageRoot = realpathSync(packageRoot);
			expect(discovered.packages).toEqual(['raw-octane']);
			expect(discovered.dependencies).toEqual(
				expect.arrayContaining([projectManifest, join(resolvedPackageRoot, 'package.json')]),
			);
			expect(discovered.missingDependencies).toContain(
				join(resolvedPackageRoot, 'node_modules/missing-child/package.json'),
			);
			expect(discovered.missingDependencies).toContain(
				join(realpathSync(root), 'node_modules/missing-child/package.json'),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
