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
import { inspectProfileOutput, uniqueMetadata } from './_profile-output';

const COMPONENT =
	"import { useState } from 'octane';\n" +
	'export function App() @{\n' +
	'  const [count] = useState(0);\n' +
	'  <p>{count as string}</p>\n' +
	'}\n';

const HOOK =
	"import { useState } from 'octane';\n" + 'export function useCount() { return useState(0); }\n';

function profileFiles(code: string | undefined): Set<string> {
	if (code === undefined) return new Set();
	const output = inspectProfileOutput(code);
	return new Set(uniqueMetadata([...output.components, ...output.hooks]).map(({ file }) => file));
}

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

	it('selects a universal renderer by canonical filename without changing DOM output', () => {
		const legacy = createOctaneCompiler({ root: '/project', hmr: false, dev: false });
		const configured = createOctaneCompiler({
			root: '/project',
			hmr: false,
			dev: false,
			renderers: {
				registry: { object: '/src/object-renderer.js' },
				boundaries: {
					'/src/object-boundaries.js': {
						Canvas: {
							ownerRenderer: 'dom',
							childRenderer: 'object',
							prop: 'children',
						},
					},
				},
				rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
			},
		});

		const legacyDom = legacy.transform(COMPONENT, '/project/src/App.tsrx');
		const configuredDom = configured.transform(COMPONENT, '/project/src/App.tsrx');
		expect(configuredDom?.renderer).toEqual({ id: 'dom', module: 'octane', target: 'dom' });
		// DOM output identity is an explicit compatibility gate for renderer selection.
		expect(configuredDom?.code).toBe(legacyDom?.code);

		const objectSource = 'export function Scene() @{ <node label="object" /> }\n';
		const object = configured.transform(objectSource, '/project/src/scenes/Scene.object.tsrx?used');
		expect(object?.renderer).toEqual({
			id: 'object',
			module: '/src/object-renderer.js',
			target: 'universal',
		});
		expect(object?.code).toMatch(/from ["']\/src\/object-renderer\.js["']/);
	});

	it('specializes only disposable production roots with proven void imports', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-void-root-'));
		try {
			const src = join(root, 'src');
			mkdirSync(src);
			writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }));
			const component = join(src, 'Main.tsrx');
			const entry = join(src, 'main.js');
			const defaultEntry =
				"import { createRoot } from 'octane';\n" +
				"import Main from './Main.tsrx';\n" +
				'createRoot(document.body).render(Main);\n';
			const defaultComponent = 'export default function Main() @{ <main>ready</main> }\n';
			writeFileSync(component, defaultComponent);
			writeFileSync(entry, defaultEntry);

			const compiler = createOctaneCompiler({ root, hmr: false, dev: false });
			// The neutral compiler cannot know what a bundler alias or virtual load
			// makes this request mean, so an on-disk lookalike is never proof.
			const unproven = compiler.transform(defaultEntry, entry);
			expect(unproven).toMatchObject({ kind: 'none', code: defaultEntry });
			expect(unproven?.dependencies).not.toContain(component);

			const compiledDefault = compiler.transform(defaultComponent, component, {
				hmr: false,
				dev: false,
				collectVoidComponentExports: true,
			});
			expect(compiledDefault?.voidComponentExports).toEqual(['default']);
			const proveDefault = (request: string, imported: string) =>
				request === './Main.tsrx' && imported === 'default';
			const specialized = compiler.transform(defaultEntry, entry, {
				isVoidComponentImport: proveDefault,
			});
			expect(specialized?.kind).toBe('slots');
			expect(specialized?.code).toContain('__createVoidRoot');
			expect(specialized?.code).not.toContain('hookSlots');
			const server = compiler.transform(defaultEntry, entry, {
				environment: 'server',
				dev: false,
				hmr: false,
				isVoidComponentImport: proveDefault,
			});
			expect(server).toMatchObject({ kind: 'none', code: defaultEntry });
			expect(server?.code).not.toContain('__createVoidRoot');

			// Dev/HMR keeps the public generic root because a hot replacement can
			// change the component's return contract without changing its identity.
			expect(
				compiler.transform(defaultEntry, entry, {
					dev: true,
					hmr: false,
					isVoidComponentImport: proveDefault,
				}),
			).toMatchObject({ kind: 'none', code: defaultEntry });
			expect(
				compiler.transform(defaultEntry, entry, {
					hmr: 'vite',
					isVoidComponentImport: proveDefault,
				}),
			).toMatchObject({ kind: 'none', code: defaultEntry });

			// A component-owned value return makes both default and named exports
			// ineligible. Nested function returns are a separate scope and stay safe.
			writeFileSync(
				component,
				"export default function Main(p) @{ if (p.early) return 'early'; <main>ready</main> }\n",
			);
			const valueReturning = compiler.transform(
				"export default function Main(p) @{ if (p.early) return 'early'; <main>ready</main> }\n",
				component,
				{ collectVoidComponentExports: true },
			);
			expect(valueReturning?.voidComponentExports).toEqual([]);

			const namedEntry =
				"import { createRoot as root } from 'octane';\n" +
				"import { Main as Entry } from './Main.tsrx';\n" +
				'root(document.body).render(Entry);\n';
			writeFileSync(
				component,
				"export function Main() @{ const nested = () => { return 'nested'; }; <main>{nested() as string}</main> }\n",
			);
			const named = compiler.transform(namedEntry, entry, {
				isVoidComponentImport: (request, imported) =>
					request === './Main.tsrx' && imported === 'Main',
			});
			expect(named?.kind).toBe('slots');
			expect(named?.code).toContain('__createVoidRoot');

			// Specialize the proven disposable expression without changing a
			// neighboring unknown render or a root retained for later renders.
			const unknown = join(src, 'Unknown.js');
			writeFileSync(unknown, 'export function Unknown() { return null; }\n');
			const mixedEntry =
				"import { createRoot } from 'octane';\n" +
				"import { Main } from './Main.tsrx';\n" +
				"import { Unknown } from './Unknown.js';\n" +
				'createRoot(document.body).render(Main);\n' +
				'createRoot(document.documentElement).render(Unknown);\n' +
				'const retained = createRoot(document.body);\n' +
				'retained.render(Main);\n';
			const mixed = compiler.transform(mixedEntry, entry, {
				isVoidComponentImport: (request, imported) =>
					request === './Main.tsrx' && imported === 'Main',
			});
			expect(mixed?.kind).toBe('slots');
			expect(mixed?.code.match(/_\$createVoidRoot\(/g)).toHaveLength(1);
			expect(mixed?.code).toContain('createRoot(document.documentElement).render(Unknown)');
			expect(mixed?.code).toContain('const retained = createRoot(document.body)');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('applies profiling metadata only to client transforms', () => {
		const compiler = createOctaneCompiler({ root: '/project', profile: true });
		const client = compiler.transform(COMPONENT, '/project/src/App.tsrx', {
			environment: 'client',
			hmr: false,
			dev: false,
		});
		const clientProfile = inspectProfileOutput(client!.code);
		expect(uniqueMetadata(clientProfile.components)).toEqual([
			expect.objectContaining({ name: 'App', file: '/src/App.tsrx', kind: 'component' }),
		]);

		const disabled = compiler.transform(COMPONENT, '/project/src/App.tsrx', {
			environment: 'client',
			profile: false,
		});
		expect(inspectProfileOutput(disabled!.code).profileImports).toEqual(new Set());

		const server = compiler.transform(COMPONENT, '/project/src/App.tsrx', {
			environment: 'server',
			profile: true,
		});
		expect(inspectProfileOutput(server!.code).profileImports).toEqual(new Set());
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

	it('uses portable source names in profile metadata', () => {
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
			expect(profileFiles(app?.code)).toEqual(new Set(['/src/App.tsrx']));

			const packageRoot = join(fixtureRoot, 'shared-ui');
			mkdirSync(join(packageRoot, 'src'), { recursive: true });
			writeFileSync(
				join(packageRoot, 'package.json'),
				JSON.stringify({ name: '@scope/ui', peerDependencies: { octane: '*' } }),
			);
			const packaged = compiler.transform(COMPONENT, join(packageRoot, 'src/Card.tsx'));
			expect(profileFiles(packaged?.code)).toEqual(
				new Set(['/@package/%40scope%2Fui/src/Card.tsx']),
			);
			const packagedHook = compiler.transform(HOOK, join(packageRoot, 'src/useCount.ts'));
			expect(profileFiles(packagedHook?.code)).toEqual(
				new Set(['/@package/%40scope%2Fui/src/useCount.ts']),
			);

			const externalRoot = join(fixtureRoot, 'unowned');
			mkdirSync(externalRoot);
			const external = compiler.transform(COMPONENT, join(externalRoot, 'Loose.tsrx'));
			expect(profileFiles(external?.code)).toEqual(new Set(['/@external/Loose.tsrx']));
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
					dependencies: { 'singleton-core': '1.0.0' },
					peerDependencies: { octane: '*' },
					optionalDependencies: { 'missing-child': '1.0.0' },
					octane: {
						vite: {
							optimizeDeps: {
								exclude: ['singleton-core', 'singleton-core', '', ' padded ', 42],
							},
						},
					},
				}),
			);
			writeFileSync(join(packageRoot, 'index.js'), 'export const value = 1;\n');

			const discovered = createOctaneCompiler({ root }).discoverSourceDependencies();
			const resolvedPackageRoot = realpathSync(packageRoot);
			expect(discovered.packages).toEqual(['raw-octane']);
			expect(discovered.viteOptimizeDepsExclusions).toEqual(['singleton-core']);
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
