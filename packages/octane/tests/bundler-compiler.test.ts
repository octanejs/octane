import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
	CLIENT_REFERENCE_MANIFEST_FILENAME,
	CLIENT_REFERENCE_MANIFEST_VERSION,
	OCTANE_RUNTIME_REQUESTS,
	canonicalModuleId,
	createClientReferenceManifest,
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
	it('normalizes the canonical cross-adapter client-reference manifest', () => {
		const first = {
			id: 'octane-client-reference-v1:object:/src/First.object.tsrx',
			moduleId: '/src/First.object.tsrx',
			renderer: 'object',
		};
		const second = {
			id: 'octane-client-reference-v1:object:/src/Second.object.tsrx',
			moduleId: '/src/Second.object.tsrx',
			renderer: 'object',
		};
		expect(CLIENT_REFERENCE_MANIFEST_FILENAME).toBe('octane-client-references.json');
		expect(
			createClientReferenceManifest([
				{ reference: second, chunks: ['assets/z.js'] },
				{ reference: first, chunks: ['assets/b.js', 'assets/a.js'] },
				{ reference: first, chunks: ['assets/a.js', 'assets/c.js'] },
				{ reference: second, chunks: [] },
			]),
		).toEqual({
			version: CLIENT_REFERENCE_MANIFEST_VERSION,
			references: {
				[first.id]: {
					moduleId: first.moduleId,
					renderer: first.renderer,
					chunks: ['assets/a.js', 'assets/b.js', 'assets/c.js'],
				},
				[second.id]: {
					moduleId: second.moduleId,
					renderer: second.renderer,
					chunks: ['assets/z.js'],
				},
			},
		});
		expect(() =>
			createClientReferenceManifest([
				{ reference: first, chunks: ['one.js'] },
				{
					reference: { ...first, moduleId: '/src/Conflicting.object.tsrx' },
					chunks: ['two.js'],
				},
			]),
		).toThrow(/Conflicting Octane client-reference metadata/);
	});

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
		expect(configuredDom?.renderer).toEqual({
			id: 'dom',
			module: 'octane',
			target: 'dom',
			server: 'render',
			text: 'host',
			capabilities: [],
		});
		// DOM output identity is an explicit compatibility gate for renderer selection.
		expect(configuredDom?.code).toBe(legacyDom?.code);

		const objectSource = 'export function Scene() @{ <node label="object" /> }\n';
		const object = configured.transform(objectSource, '/project/src/scenes/Scene.object.tsrx?used');
		expect(object?.renderer).toEqual({
			id: 'object',
			module: '/src/object-renderer.js',
			target: 'universal',
			server: 'unsupported',
			text: 'reject',
			capabilities: [],
		});
		expect(object?.code).toMatch(/from ["']\/src\/object-renderer\.js["']/);
	});

	it('emits identical client-reference identity and an inert server stub for client-only modules', async () => {
		const compiler = createOctaneCompiler({
			root: '/project',
			hmr: false,
			renderers: {
				registry: {
					object: {
						module: '/src/object-renderer.js',
						server: 'client-only',
					},
				},
				rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
			},
		});
		const source = `
import './authored-setup.js';
globalThis.__clientOnlyAuthoredSetup = true;
export const metadata = 'client';
export default function Scene() @{ <node /> }
export function Named() @{ <node /> }
`;
		const id = '/project/src/scenes/Scene.object.tsrx';
		const client = compiler.transform(source, id, { environment: 'client' });
		const server = compiler.transform(source, id, { environment: 'server' });

		expect(client).toMatchObject({
			kind: 'compile',
			clientReference: {
				moduleId: '/src/scenes/Scene.object.tsrx',
				renderer: 'object',
			},
		});
		expect(server).toMatchObject({
			kind: 'client-only-stub',
			clientOnlyExports: ['Named', 'default', 'metadata'],
			clientReference: client?.clientReference,
		});
		expect(server?.code).not.toContain('authored-setup');
		expect(server?.code).not.toContain('__clientOnlyAuthoredSetup');
		expect(server?.code).not.toContain("'client'");
		expect(server?.code.match(/^\t\tset: fail,$/gm)).toHaveLength(1);

		const stubUrl = `data:text/javascript;base64,${Buffer.from(server!.code).toString('base64')}`;
		const execution = spawnSync(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				`const stub = await import(${JSON.stringify(stubUrl)}); try { stub.default(); } catch (error) { console.log(JSON.stringify({ keys: Object.keys(stub).sort(), code: error.code, filename: error.filename, message: error.message })); }`,
			],
			{ encoding: 'utf8' },
		);
		expect(execution.status).toBe(0);
		const useError = JSON.parse(execution.stdout.trim());
		expect(useError).toMatchObject({
			keys: ['Named', 'default', 'metadata'],
			code: 'OCTANE_CLIENT_ONLY_SERVER_USE',
			filename: '/src/scenes/Scene.object.tsrx',
		});
		expect(useError.message).toMatch(/client-only export "default".*renderer "object"/i);
	});

	it('fails closed when a client-only renderer rule selects source outside the stub contract', () => {
		const compiler = createOctaneCompiler({
			root: '/project',
			renderers: {
				registry: {
					object: {
						module: '/src/object-renderer.js',
						server: 'client-only',
					},
				},
				rules: [{ include: 'src/scenes/**', renderer: 'object' }],
			},
		});
		for (const classify of [
			() => compiler.clientReferenceForFile('/project/src/scenes/setup.ts'),
			() =>
				compiler.transform('export const setup = true;\n', '/project/src/scenes/setup.ts', {
					environment: 'server',
				}),
		]) {
			let error: any;
			try {
				classify();
			} catch (cause) {
				error = cause;
			}
			expect(error).toMatchObject({
				code: 'OCTANE_CLIENT_ONLY_SOURCE_UNSUPPORTED',
				filename: '/src/scenes/setup.ts',
			});
			expect(error.message).toMatch(/server: "client-only".*\.tsrx.*\.tsx/s);
		}
	});

	it('preserves runtime TypeScript namespace and export-import names without type-only exports', () => {
		const compiler = createOctaneCompiler({
			root: '/project',
			renderers: {
				registry: {
					object: { module: '/src/object-renderer.js', server: 'client-only' },
				},
				rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
			},
		});
		const source = `
export namespace RuntimeNamespace { export const value = 1 }
export import RuntimeAlias = require('./authored-runtime.js');
export default interface ErasedShape { value: string }
`;
		const server = compiler.transform(source, '/project/src/Scene.object.tsrx', {
			environment: 'server',
		});
		expect(server).toMatchObject({
			kind: 'client-only-stub',
			clientOnlyExports: ['RuntimeAlias', 'RuntimeNamespace'],
		});
		expect(server?.code).not.toContain('authored-runtime');

		let error: any;
		try {
			compiler.transform('const value = 1; export = value;\n', '/project/src/Legacy.object.tsrx', {
				environment: 'server',
			});
		} catch (cause) {
			error = cause;
		}
		expect(error).toMatchObject({ code: 'OCTANE_CLIENT_ONLY_EXPORT_ASSIGNMENT_UNSUPPORTED' });
	});

	it('rejects client-only bindings that remain live in ordinary server modules', () => {
		const compiler = createOctaneCompiler({ root: '/project' });
		const clientOnlyImports = [
			{
				request: './Scene.object.tsrx',
				resolvedId: '/project/src/Scene.object.tsrx',
				reference: {
					id: 'octane-client-reference-v1:object:/src/Scene.object.tsrx',
					moduleId: '/src/Scene.object.tsrx',
					renderer: 'object',
				},
			},
		];
		let error: any;
		try {
			compiler.transform(
				"import Scene from './Scene.object.tsrx';\nexport const live = Scene as unknown;\n",
				'/project/src/leak.ts',
				{ environment: 'server', clientOnlyImports },
			);
		} catch (cause) {
			error = cause;
		}
		expect(error).toMatchObject({
			code: 'OCTANE_CLIENT_ONLY_SERVER_USE',
			filename: '/src/leak.ts',
			loc: { line: 2 },
		});
		expect(error.message).toMatch(/Scene\.object\.tsrx.*server: "omit-child"/s);
	});

	it.each([
		['enum initializer', 'enum Value { SceneValue = Scene }'],
		['namespace initializer', 'namespace Value { export const scene = Scene }'],
		['export assignment', 'export = Scene'],
		['import-equals alias', 'import Alias = Scene.Member'],
		['parameter-property default', 'class Value { constructor(public scene = Scene) {} }'],
		['computed parameter key', 'function read({ [Scene]: value }) { return value }'],
		[
			'parameter default before body var',
			'function read(value = Scene) { var Scene; return value }',
		],
		[
			'body use outside a nested class static var',
			'function read() { class Local { static { var Scene } } return Scene }',
		],
	])('rejects a client-only binding in a runtime TypeScript %s', (_name, statement) => {
		const compiler = createOctaneCompiler({ root: '/project' });
		expect(() =>
			compiler.transform(
				`import Scene from './Scene.object.tsrx';\n${statement}\n`,
				'/project/src/leak.ts',
				{
					environment: 'server',
					clientOnlyImports: [
						{
							request: './Scene.object.tsrx',
							resolvedId: '/project/src/Scene.object.tsrx',
							reference: {
								id: 'octane-client-reference-v1:object:/src/Scene.object.tsrx',
								moduleId: '/src/Scene.object.tsrx',
								renderer: 'object',
							},
						},
					],
				},
			),
		).toThrow(/Client-only export "default".*server: "omit-child"/s);
	});

	it('allows a named class expression to shadow a client-only import in its own body', () => {
		const compiler = createOctaneCompiler({ root: '/project' });
		expect(() =>
			compiler.transform(
				"import Scene from './Scene.object.tsrx';\nexport const Local = class Scene { static current = Scene };\n",
				'/project/src/shadow.ts',
				{
					environment: 'server',
					clientOnlyImports: [
						{
							request: './Scene.object.tsrx',
							resolvedId: '/project/src/Scene.object.tsrx',
							reference: {
								id: 'octane-client-reference-v1:object:/src/Scene.object.tsrx',
								moduleId: '/src/Scene.object.tsrx',
								renderer: 'object',
							},
						},
					],
				},
			),
		).not.toThrow();
	});

	it('classifies TypeScript import-equals requests and rejects their live server aliases', () => {
		const compiler = createOctaneCompiler({ root: '/project' });
		const source = "import Scene = require('./Scene.object.tsrx');\nexport const live = Scene;\n";
		expect(compiler.findServerImportRequests(source, '/project/src/leak.ts')).toEqual([
			'./Scene.object.tsrx',
		]);
		expect(() =>
			compiler.transform(source, '/project/src/leak.ts', {
				environment: 'server',
				clientOnlyImports: [
					{
						request: './Scene.object.tsrx',
						resolvedId: '/project/src/Scene.object.tsrx',
						reference: {
							id: 'octane-client-reference-v1:object:/src/Scene.object.tsrx',
							moduleId: '/src/Scene.object.tsrx',
							renderer: 'object',
						},
					},
				],
			}),
		).toThrow(/Client-only export "\*".*server: "omit-child"/s);
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
			expect(compiled?.code).toContain('<p>octane</p>');
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
				JSON.stringify({
					name: 'app',
					dependencies: {
						'@identity-sensitive/app-extension': '1.0.0',
						'raw-octane': '1.0.0',
					},
				}),
			);
			const packageRoot = join(root, 'node_modules/raw-octane');
			mkdirSync(packageRoot, { recursive: true });
			const packageManifest = join(packageRoot, 'package.json');
			writeFileSync(
				packageManifest,
				JSON.stringify({
					name: 'raw-octane',
					main: 'index.js',
					dependencies: {
						'@identity-sensitive/binding-extension': '1.0.0',
						'identity-sensitive-core': '1.0.0',
					},
					peerDependencies: { octane: '*' },
					optionalDependencies: { 'missing-child': '1.0.0' },
					octane: {
						vite: {
							optimizeDeps: {
								exclude: [
									'@identity-sensitive/*',
									'@identity-sensitive/*',
									'identity-sensitive-core',
									'identity-sensitive-core',
									'',
									' padded ',
									42,
								],
							},
						},
					},
				}),
			);
			writeFileSync(join(packageRoot, 'index.js'), 'export const value = 1;\n');

			const discovered = createOctaneCompiler({ root }).discoverSourceDependencies();
			const resolvedPackageRoot = realpathSync(packageRoot);
			expect(discovered.packages).toEqual(['raw-octane']);
			expect(discovered.viteOptimizeDepsExclusions).toEqual([
				'@identity-sensitive/app-extension',
				'@identity-sensitive/binding-extension',
				'identity-sensitive-core',
			]);
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

describe('requireDirective ownership gate', () => {
	const DIRECTIVE_COMPONENT = "'use octane';\n" + COMPONENT;
	const REACT_TSX =
		"import * as React from 'react';\n" +
		'export function Host() {\n' +
		'  return <p className="host">{\'react\'}</p>;\n' +
		'}\n';

	it('compiles only directive-carrying project modules when enabled', () => {
		const compiler = createOctaneCompiler({
			root: resolve('/project'),
			requireDirective: true,
		});
		// Directive-carrying .tsrx compiles; the directive never ships.
		const island = compiler.transform(DIRECTIVE_COMPONENT, '/project/src/Island.tsrx');
		expect(island?.kind).toBe('compile');
		expect(island?.code).not.toContain('use octane');
		// Octane-in-.tsx authoring survives behind the directive.
		const octaneTsx = compiler.transform(
			"'use octane';\nexport function App() @{\n  <p>{'oct'}</p>\n}\n",
			'/project/src/App.tsx',
		);
		expect(octaneTsx?.kind).toBe('compile');
		// An undirected project .tsx belongs to the host toolchain, untouched.
		expect(compiler.transform(REACT_TSX, '/project/src/Host.tsx')).toBeNull();
		// An undirected project .tsrx has no other compiler — hard error.
		expect(() => compiler.transform(COMPONENT, '/project/src/Bad.tsrx')).toThrow(
			/has no 'use octane' module directive/,
		);
	});

	it('gates hook slotting and reports likely-forgotten directives once', () => {
		const warnings: string[] = [];
		const compiler = createOctaneCompiler({
			root: resolve('/project'),
			requireDirective: true,
			warn: (message: string) => warnings.push(message),
		});
		// Undirected octane-importing .ts: untouched, one diagnostic.
		expect(compiler.transform(HOOK, '/project/src/useCount.ts')).toBeNull();
		expect(compiler.transform(HOOK, '/project/src/useCount.ts')).toBeNull();
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('/src/useCount.ts');
		expect(warnings[0]).toContain("'use octane'");
		// The directive turns slotting back on, and is stripped from output.
		const directed = compiler.transform("'use octane';\n" + HOOK, '/project/src/useDirected.ts');
		expect(directed?.kind).toBe('slots');
		expect(directed?.code).not.toContain('use octane');
	});

	it('keeps manifest-declared packages exempt from the directive gate', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-directive-manifest-'));
		try {
			writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }));
			const packageRoot = join(root, 'node_modules/raw-octane');
			mkdirSync(join(packageRoot, 'src'), { recursive: true });
			writeFileSync(
				join(packageRoot, 'package.json'),
				JSON.stringify({ name: 'raw-octane', peerDependencies: { octane: '*' } }),
			);
			const compiler = createOctaneCompiler({ root, requireDirective: true });
			// Installed packages made their Octane decision in their manifest —
			// no directive required, exactly as without the gate.
			expect(
				compiler.transform(
					`export function App() { return <p>{'raw'}</p>; }`,
					join(packageRoot, 'src/App.tsx'),
				)?.kind,
			).toBe('compile');
			expect(compiler.transform(COMPONENT, join(packageRoot, 'src/Island.tsrx'))?.kind).toBe(
				'compile',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('tolerates and strips the directive when the gate is off', () => {
		const compiler = createOctaneCompiler({ root: resolve('/project') });
		const island = compiler.transform(DIRECTIVE_COMPONENT, '/project/src/Island.tsrx');
		expect(island?.kind).toBe('compile');
		expect(island?.code).not.toContain('use octane');
		const slotted = compiler.transform("'use octane';\n" + HOOK, '/project/src/useCount.ts');
		expect(slotted?.kind).toBe('slots');
		expect(slotted?.code).not.toContain('use octane');
	});

	it('keeps the directive out of Octane-owned pass-through results', () => {
		// A directed module with nothing to rewrite (no hooks to slot) is still
		// Octane output: whatever code the result carries omits the build-time
		// directive, matching compiled and slotted modules.
		const compiler = createOctaneCompiler({ root: resolve('/project'), requireDirective: true });
		const untouched = compiler.transform(
			"'use octane';\nimport { createRoot } from 'octane';\nexport const boot = createRoot;\n",
			'/project/src/boot.ts',
		);
		expect(untouched?.code ?? '').not.toContain('use octane');
	});

	it('recognizes the directive after comments and other directives', () => {
		const compiler = createOctaneCompiler({ root: resolve('/project'), requireDirective: true });
		const source = '// island\n/* mixed */\n"use client";\n\'use octane\';\n' + COMPONENT;
		const out = compiler.transform(source, '/project/src/Island.tsrx');
		expect(out?.kind).toBe('compile');
		expect(out?.code).not.toContain('use octane');
	});

	it('lets exclude route .tsrx paths to another tsrx compiler', () => {
		// tsrx syntax can target other renderers (@tsrx/react); a project
		// routing part of its .tsrx through a different tsrx compiler lists
		// those paths in `exclude`, and Octane never claims them — no error,
		// no compile, no directive requirement.
		const warnings: string[] = [];
		const compiler = createOctaneCompiler({
			root: resolve('/project'),
			requireDirective: true,
			exclude: ['src/react-app/'],
			warn: (message: string) => warnings.push(message),
		});
		expect(compiler.transform(COMPONENT, '/project/src/react-app/View.tsrx')).toBeNull();
		// The exclusion wins even over a directive, with a diagnostic naming
		// the conflict instead of a silent no-op.
		expect(
			compiler.transform(DIRECTIVE_COMPONENT, '/project/src/react-app/Island.tsrx'),
		).toBeNull();
		expect(warnings.some((message) => message.includes('/src/react-app/Island.tsrx'))).toBe(true);
		expect(warnings.some((message) => message.includes('exclu'))).toBe(true);
		// The same conflict diagnostic covers the .ts/.js hook-slot exclusion.
		expect(
			compiler.transform("'use octane';\n" + HOOK, '/project/src/react-app/util.ts'),
		).toBeNull();
		expect(warnings.some((message) => message.includes('/src/react-app/util.ts'))).toBe(true);
		// Outside the excluded paths the gate is unchanged.
		expect(() => compiler.transform(COMPONENT, '/project/src/islands/Bad.tsrx')).toThrow(
			/has no 'use octane' module directive/,
		);
	});
});

describe('requireDirective and client-only classification', () => {
	it('classifies client references with the same ownership gate as transforms', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-directive-client-only-'));
		try {
			writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }));
			mkdirSync(join(root, 'src/scenes'), { recursive: true });
			const reactScene =
				"import * as React from 'react';\nexport function Scene() { return <p/>; }\n";
			const octaneScene = "'use octane';\nexport function Scene() @{ <node /> }\n";
			const reactFile = join(root, 'src/scenes/ReactScene.tsx');
			const octaneFile = join(root, 'src/scenes/OctaneScene.tsx');
			writeFileSync(reactFile, reactScene);
			writeFileSync(octaneFile, octaneScene);
			const compiler = createOctaneCompiler({
				root,
				requireDirective: true,
				renderers: {
					registry: { object: { module: '/src/object-renderer.js', server: 'client-only' } },
					rules: [{ include: 'src/scenes/**', renderer: 'object' }],
				},
			});
			// An undirected project module matched by a client-only renderer rule
			// is NOT Octane's: importers must not receive a client reference for
			// a module whose own transform passes through to the host toolchain.
			expect(compiler.clientReferenceForFile(reactFile)).toBeNull();
			const serverTransform = compiler.transform(reactScene, reactFile, {
				environment: 'server',
			});
			expect(serverTransform).toBeNull();
			// The directed module keeps full client-only behavior: reference and
			// server stub agree on identity.
			const reference = compiler.clientReferenceForFile(octaneFile);
			expect(reference).toMatchObject({ renderer: 'object' });
			const stub = compiler.transform(octaneScene, octaneFile, { environment: 'server' });
			expect(stub).toMatchObject({ kind: 'client-only-stub', clientReference: reference });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
