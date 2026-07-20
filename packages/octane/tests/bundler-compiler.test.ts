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
	findVoidComponentImports,
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
		expect(canonicalModuleId('#nitro/virtual/polyfills', root)).toBe('#nitro/virtual/polyfills');
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

	it('preserves universal runtime specialization on bundler transform metadata', () => {
		const compiler = createOctaneCompiler({
			root: '/project',
			hmr: false,
			dev: false,
			universalRuntime: { runtime: 'lynx', thread: 'background' },
			renderers: {
				registry: { lynx: '@octanejs/lynx/renderer' },
				default: 'lynx',
			},
		});
		const source = 'export function App() @{ <view /> }\n';
		const result = compiler.transform(source, '/project/src/App.tsrx');

		expect(result).toMatchObject({
			kind: 'compile',
			renderer: { id: 'lynx', target: 'universal' },
			universalRuntime: { runtime: 'lynx', thread: 'background' },
		});
		expect(result?.code).not.toContain('main-thread');
		expect(result?.code).not.toContain('background');
	});

	it('validates renderer-selected project helpers without claiming their output', () => {
		const renderers = {
			registry: {
				native: {
					module: '@renderers/native',
					validation: {
						forbiddenGlobals: ['document'],
						forbiddenImports: ['browser-only'],
					},
				},
			},
			default: 'native',
		};
		const compiler = createOctaneCompiler({ root: '/project', renderers });

		expect(() =>
			compiler.transform('export const title = document.title;', '/project/src/environment.ts'),
		).toThrow(/renderer "native" forbids unbound global "document".*environment\.ts:1:/);
		expect(() =>
			compiler.transform("import runtime from 'browser-only';", '/project/src/runtime.js'),
		).toThrow(/renderer "native" forbids static import "browser-only".*runtime\.js:1:/);
		expect(
			compiler.transform('export const platform = "native";', '/project/src/platform.ts'),
		).toBeNull();

		const excluded = createOctaneCompiler({
			root: '/project',
			exclude: ['/generated/'],
			renderers,
		});
		expect(() =>
			excluded.transform(
				'export const title = document.title;',
				'/project/generated/environment.ts',
			),
		).not.toThrow();
		expect(() =>
			compiler.transform(
				'export const title = document.title;',
				'/project/node_modules/example/environment.js',
			),
		).not.toThrow();

		const hostOwned = createOctaneCompiler({
			root: '/project',
			renderers,
			requireDirective: true,
		});
		expect(() =>
			hostOwned.transform('export const title = document.title;', '/project/src/host.ts'),
		).not.toThrow();
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
			const memoComponent =
				"import { memo as cache } from 'octane';\n" +
				'function MainImpl(p) @{ if (!p.ready) return null; <main>ready</main> }\n' +
				'export const Main = cache(MainImpl);\n';
			const compiledMemo = compiler.transform(memoComponent, component, {
				hmr: false,
				dev: false,
				collectVoidComponentExports: true,
			});
			expect(compiledMemo?.voidComponentExports).toEqual(['Main']);
			expect(compiledMemo?.code).toContain('_$ifBlock');
			expect(compiledMemo?.code).not.toContain('componentSlot');
			const constComponent =
				"export const fixtureKind = 'guarded',\n" +
				'  Main = function (p) @{ if (!p.ready) return null; <main>ready</main> },\n' +
				'  fixtureAfter = fixtureKind;\n';
			const compiledConst = compiler.transform(constComponent, component, {
				hmr: false,
				dev: false,
				collectVoidComponentExports: true,
			});
			expect(compiledConst?.voidComponentExports).toEqual(['Main']);
			expect(
				compiler.transform(constComponent, component, {
					environment: 'server',
					hmr: false,
					dev: false,
				}),
			).toMatchObject({ kind: 'compile' });
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

			// A renderable component-owned return stays ineligible. Null-only guards
			// lower to template control flow above; nested function returns remain a
			// separate scope and stay safe.
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

			const modularSource =
				"import { Main as Child } from './Main.tsrx';\n" +
				'export function Parent(p) @{ <section><Child ready={p.ready} /></section> }\n';
			expect(findVoidComponentImports(modularSource, join(src, 'Parent.tsrx'))).toEqual([
				{ request: './Main.tsrx', imported: 'Main' },
			]);
			const modular = compiler.transform(modularSource, join(src, 'Parent.tsrx'), {
				hmr: false,
				dev: false,
				isVoidComponentImport: (request, imported) =>
					request === './Main.tsrx' && imported === 'Main',
			});
			expect(modular?.code).toContain('_$componentSlotVoid(');
			expect(modular?.code).not.toContain('_$componentSlot(');

			const shadowed = compiler.transform(
				"import { Main as Child } from './Main.tsrx';\n" +
					'export function Parent(Child) @{ <section><Child /></section> }\n',
				join(src, 'Shadowed.tsrx'),
				{
					hmr: false,
					dev: false,
					isVoidComponentImport: () => true,
				},
			);
			expect(shadowed?.code).toContain('_$componentSlot(');
			expect(shadowed?.code).not.toContain('_$componentSlotVoid(');

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

	it('lowers statically compilable ErrorBoundary JSX without retaining the builtin', () => {
		const compiler = createOctaneCompiler({ root: '/project', hmr: false, dev: false });
		const source = `
import { ErrorBoundary as Boundary } from 'octane';
function Thrower(p) @{ if (p.fail) throw new Error('boom'); <span>ok</span> }
export function App(p) @{
  <Boundary fallback={(error, reset) => <button onClick={reset}>{(error as Error).message}</button>}>
    <Thrower fail={p.fail} />
  </Boundary>
}`;
		const client = compiler.transform(source, '/project/src/App.tsrx', {
			hmr: false,
			dev: false,
		});
		expect(client?.code).toContain('_$tryBlock(');
		expect(client?.code).toContain(', true);');
		expect(client?.code).not.toContain('ErrorBoundary');

		const server = compiler.transform(source, '/project/src/App.tsrx', {
			environment: 'server',
			dev: false,
		});
		expect(server?.code).toContain('_$ssrTry(');
		expect(server?.code).toContain('(__error, __scope, __reset) =>');
		expect(server?.code).toContain(', undefined, true)');
		expect(server?.code).not.toContain('ErrorBoundary');

		const dynamic = compiler.transform(
			`import { ErrorBoundary as Boundary } from 'octane';
export function App(p) @{ <Boundary fallback={p.fallback}><span>ok</span></Boundary> }`,
			'/project/src/Dynamic.tsrx',
			{ hmr: false, dev: false },
		);
		expect(dynamic?.code).toContain('ErrorBoundary as Boundary');
		expect(dynamic?.code).toContain('_$componentSlot(');
		expect(dynamic?.code).not.toContain('_$tryBlock(');

		const mixedSource = `import { ErrorBoundary as Boundary } from 'octane';
export function App(p) @{ <><Boundary fallback={<span>static</span>}><span>ok</span></Boundary><Boundary fallback={p.fallback}><span>dynamic</span></Boundary></> }`;
		const mixed = compiler.transform(mixedSource, '/project/src/MixedBoundary.tsrx', {
			hmr: false,
			dev: false,
		});
		expect(mixed?.code).toContain('ErrorBoundary as Boundary');
		expect(mixed?.code).toContain('_$tryBlock(');
		expect(mixed?.code).toContain('_$componentSlot(');

		const mixedServer = compiler.transform(mixedSource, '/project/src/MixedBoundary.tsrx', {
			environment: 'server',
			dev: false,
		});
		expect(mixedServer?.code).toContain('ErrorBoundary as Boundary');
		expect(mixedServer?.code).toContain('_$ssrTry(');
		expect(mixedServer?.code).toContain('_$ssrComponent(');

		const asyncFallback = compiler.transform(
			`import { ErrorBoundary as Boundary } from 'octane';
export function App() @{ <Boundary fallback={async (error) => String(error)}><span>ok</span></Boundary> }`,
			'/project/src/AsyncFallback.tsrx',
			{ hmr: false, dev: false },
		);
		expect(asyncFallback?.code).toContain('ErrorBoundary as Boundary');
		expect(asyncFallback?.code).toContain('_$componentSlot(');
		expect(asyncFallback?.code).not.toContain('_$tryBlock(');
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
	const REACT_TSX =
		"import * as React from 'react';\n" +
		'export function Host() {\n' +
		'  return <p className="host">{\'react\'}</p>;\n' +
		'}\n';

	it('owns project .tsrx by extension and .tsx/.ts/.js behind the pragma', () => {
		const compiler = createOctaneCompiler({
			root: resolve('/project'),
			requireDirective: true,
		});
		// A project .tsrx needs no marker at all: in an Octane pipeline nothing
		// else compiles the syntax, so the extension itself is the ownership.
		expect(compiler.transform(COMPONENT, '/project/src/Island.tsrx')?.kind).toBe('compile');
		// Octane-in-.tsx authoring opts in with the leading pragma.
		const octaneTsx = compiler.transform(
			"/** @jsxImportSource octane */\nexport function App() @{\n  <p>{'oct'}</p>\n}\n",
			'/project/src/App.tsx',
		);
		expect(octaneTsx?.kind).toBe('compile');
		// The line-comment pragma spelling TS also honors works the same.
		const lineTsx = compiler.transform(
			"// @jsxImportSource octane\nexport function App() @{\n  <p>{'line'}</p>\n}\n",
			'/project/src/LineApp.tsx',
		);
		expect(lineTsx?.kind).toBe('compile');
		// An unmarked project .tsx belongs to the host toolchain, untouched.
		expect(compiler.transform(REACT_TSX, '/project/src/Host.tsx')).toBeNull();
		// A plain project .ts opts into octane hook slotting with the same
		// pragma. TypeScript ignores the pragma in a JSX-less module, so
		// there it acts purely as the Octane ownership marker.
		const pragmaTs = compiler.transform(
			'/** @jsxImportSource octane */\n' + HOOK,
			'/project/src/useCount.ts',
		);
		expect(pragmaTs?.kind).toBe('slots');
	});

	it('does not let a foreign @jsxImportSource pragma claim a file', () => {
		const compiler = createOctaneCompiler({
			root: resolve('/project'),
			requireDirective: true,
		});
		// A React-owned .tsx declaring its own pragma behaves exactly like an
		// unmarked file: host toolchain, untouched.
		expect(
			compiler.transform('/** @jsxImportSource react */\n' + REACT_TSX, '/project/src/Host.tsx'),
		).toBeNull();
		expect(
			compiler.transform(
				'/** @jsxImportSource @emotion/react */\n' + REACT_TSX,
				'/project/src/Styled.tsx',
			),
		).toBeNull();
		// The pragma must be LEADING trivia — after the first statement it is
		// no longer TS's pragma position and claims nothing.
		expect(
			compiler.transform(
				"'use strict';\n/** @jsxImportSource octane */\n" + REACT_TSX,
				'/project/src/Late.tsx',
			),
		).toBeNull();
		// A .tsrx stays Octane's by extension regardless of any pragma.
		expect(
			compiler.transform('/** @jsxImportSource react */\n' + COMPONENT, '/project/src/Odd.tsrx')
				?.kind,
		).toBe('compile');
		// A foreign pragma on a plain .ts claims nothing either — the module
		// stays with the host toolchain, unslotted.
		expect(
			compiler.transform('/** @jsxImportSource react */\n' + HOOK, '/project/src/useReact.ts'),
		).toBeNull();
	});

	it("claims files whose pragma names a registered renderer's intrinsics module", () => {
		const compiler = createOctaneCompiler({
			root: resolve('/project'),
			requireDirective: true,
			renderers: {
				registry: {
					three: {
						module: '@octanejs/three/renderer',
						server: 'client-only',
						intrinsics: '@octanejs/three/intrinsics',
					},
				},
				rules: [{ include: '**/*.three.tsx', renderer: 'three' }],
			},
		});
		const scene =
			'/** @jsxImportSource @octanejs/three/intrinsics */\n' +
			'export function Scene() @{ <node /> }\n';
		const out = compiler.transform(scene, '/project/src/Scene.three.tsx');
		expect(out?.kind).toBe('compile');
		expect(out?.renderer).toMatchObject({ id: 'three' });
		// An UNREGISTERED intrinsics-looking module stays foreign: the .tsx is
		// unmarked and passes through to the host toolchain.
		expect(
			compiler.transform(
				'/** @jsxImportSource @octanejs/other/intrinsics */\n' + REACT_TSX,
				'/project/src/Other.tsx',
			),
		).toBeNull();
	});

	it('gates hook slotting and reports likely-forgotten pragmas once', () => {
		const warnings: string[] = [];
		const compiler = createOctaneCompiler({
			root: resolve('/project'),
			requireDirective: true,
			warn: (message: string) => warnings.push(message),
		});
		// An unmarked octane-importing project .ts stays with the host
		// toolchain: untouched, one diagnostic with the same add-the-pragma
		// guidance an unmarked .tsx gets.
		expect(compiler.transform(HOOK, '/project/src/useCount.ts')).toBeNull();
		expect(compiler.transform(HOOK, '/project/src/useCount.ts')).toBeNull();
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('/src/useCount.ts');
		expect(warnings[0]).toContain('/** @jsxImportSource octane */');
		// The pragma turns slotting back on.
		const directed = compiler.transform(
			'/** @jsxImportSource octane */\n' + HOOK,
			'/project/src/useDirected.ts',
		);
		expect(directed?.kind).toBe('slots');
	});

	it('keeps manifest-declared packages exempt from the ownership gate', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-ownership-manifest-'));
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
			// no pragma required, exactly as without the gate.
			expect(
				compiler.transform(
					`export function App() { return <p>{'raw'}</p>; }`,
					join(packageRoot, 'src/App.tsx'),
				)?.kind,
			).toBe('compile');
			expect(compiler.transform(COMPONENT, join(packageRoot, 'src/Island.tsrx'))?.kind).toBe(
				'compile',
			);
			// Installed-package .ts hook modules keep their hook slotting with
			// no pragma — the manifest is the per-package decision.
			expect(compiler.transform(HOOK, join(packageRoot, 'src/useCount.ts'))?.kind).toBe('slots');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('lets exclude route .tsrx paths to another tsrx compiler', () => {
		// tsrx syntax can target other renderers (@tsrx/react); a project
		// routing part of its .tsrx through a different tsrx compiler lists
		// those paths in `exclude`, and Octane never claims them — no compile,
		// and NO conflict warning: extension ownership plus exclusion is the
		// intended routing pattern, not a contradiction.
		const warnings: string[] = [];
		const compiler = createOctaneCompiler({
			root: resolve('/project'),
			requireDirective: true,
			exclude: ['src/react-app/'],
			warn: (message: string) => warnings.push(message),
		});
		expect(compiler.transform(COMPONENT, '/project/src/react-app/View.tsrx')).toBeNull();
		expect(warnings).toHaveLength(0);
		// An explicit octane pragma in an excluded path IS a conflict, named
		// instead of resolving as a silent no-op.
		expect(
			compiler.transform(
				"/** @jsxImportSource octane */\nexport function App() @{ <p>{'x'}</p> }\n",
				'/project/src/react-app/Island.tsx',
			),
		).toBeNull();
		expect(warnings.some((message) => message.includes('/src/react-app/Island.tsx'))).toBe(true);
		expect(warnings.some((message) => message.includes('exclu'))).toBe(true);
		// The same conflict diagnostic covers the .ts/.js hook-slot exclusion.
		expect(
			compiler.transform(
				'/** @jsxImportSource octane */\n' + HOOK,
				'/project/src/react-app/util.ts',
			),
		).toBeNull();
		expect(warnings.some((message) => message.includes('/src/react-app/util.ts'))).toBe(true);
		// An UNMARKED excluded octane-importing .ts is a silent pass — no
		// ownership claim, nothing to conflict with.
		expect(compiler.transform(HOOK, '/project/src/react-app/plain.ts')).toBeNull();
		expect(warnings.some((message) => message.includes('/src/react-app/plain.ts'))).toBe(false);
		// Outside the excluded paths a project .tsrx compiles unconditionally.
		expect(compiler.transform(COMPONENT, '/project/src/islands/Fine.tsrx')?.kind).toBe('compile');
	});
});

describe('requireDirective and client-only classification', () => {
	it('classifies client references with the same ownership gate as transforms', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-ownership-client-only-'));
		try {
			writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }));
			mkdirSync(join(root, 'src/scenes'), { recursive: true });
			const reactScene =
				"import * as React from 'react';\nexport function Scene() { return <p/>; }\n";
			const octaneScene = '/** @jsxImportSource octane */\nexport function Scene() @{ <node /> }\n';
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
			// An unmarked project module matched by a client-only renderer rule
			// is NOT Octane's: importers must not receive a client reference for
			// a module whose own transform passes through to the host toolchain.
			expect(compiler.clientReferenceForFile(reactFile)).toBeNull();
			const serverTransform = compiler.transform(reactScene, reactFile, {
				environment: 'server',
			});
			expect(serverTransform).toBeNull();
			// The pragma-marked module keeps full client-only behavior:
			// reference and server stub agree on identity.
			const reference = compiler.clientReferenceForFile(octaneFile);
			expect(reference).toMatchObject({ renderer: 'object' });
			const stub = compiler.transform(octaneScene, octaneFile, { environment: 'server' });
			expect(stub).toMatchObject({ kind: 'client-only-stub', clientReference: reference });
			// A project .tsrx is classified Octane's by extension alone.
			const tsrxScene = 'export function Scene() @{ <node /> }\n';
			const tsrxFile = join(root, 'src/scenes/ExtensionScene.tsrx');
			writeFileSync(tsrxFile, tsrxScene);
			expect(compiler.clientReferenceForFile(tsrxFile)).toMatchObject({ renderer: 'object' });
			// A host-owned .ts under the client-only include is not Octane's
			// either: classification and transform BOTH pass it through instead
			// of one throwing the narrow-the-rule config error.
			const hostUtil = 'export const scale = (value: number) => value * 2;\n';
			const hostUtilFile = join(root, 'src/scenes/util.ts');
			writeFileSync(hostUtilFile, hostUtil);
			expect(compiler.clientReferenceForFile(hostUtilFile)).toBeNull();
			expect(compiler.transform(hostUtil, hostUtilFile, { environment: 'server' })).toBeNull();
			expect(compiler.transform(hostUtil, hostUtilFile, { environment: 'client' })).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
