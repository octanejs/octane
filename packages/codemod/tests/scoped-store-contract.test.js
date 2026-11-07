import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { bundleRuntime, installDOM } from './bundle-runtime.js';
import { runCodemod } from '../dist/index.js';
import { createScopedStorePlanner } from '../dist/scoped-store-contract.js';

const temporary = [];
afterEach(() => {
	for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
const original = `import { use as readContext } from 'react';
import { current } from './renderer';
import { valueOf } from './state';
export function useChannel() { return valueOf(readContext(current)); }`;

function fixture(replacements = {}) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-linked-store-'));
	temporary.push(root);
	const app = path.join(root, 'app');
	const library = path.join(root, 'observer');
	const files = {
		'app/package.json': JSON.stringify({
			dependencies: { observer: 'workspace:*' },
		}),
		'app/tsconfig.json': JSON.stringify({
			compilerOptions: { module: 'ESNext', moduleResolution: 'bundler' },
		}),
		'app/src/pane.tsx': '',
		'observer/package.json': JSON.stringify({
			name: 'observer',
			version: '1.0.0',
			exports: { '.': './entry.ts', './core': './public-store.ts' },
		}),
		'observer/entry.ts':
			"export * from './public-store'; export {useChannel as useSnapshot} from './react-hooks';",
		'observer/public-store.ts': "export { valueOf } from './state';",
		'observer/state.ts': 'export function valueOf(x: number) { return x; }',
		'observer/renderer.ts':
			"import { createContext } from 'react'; export const current = createContext(1);",
		'observer/react-hooks.ts': original,
		'node_modules/react/package.json': '{"name":"react","main":"index.js","types":"index.d.ts"}',
		'node_modules/react/index.js': '',
		'node_modules/react/index.d.ts':
			'export interface Context<T> { readonly value: T } export function createContext<T>(v:T):Context<T>; export function use<T>(arg:Context<T>|Promise<T>):T;',
		...replacements,
	};
	for (const [file, body] of Object.entries(files)) {
		const destination = path.join(root, file);
		fs.mkdirSync(path.dirname(destination), { recursive: true });
		fs.writeFileSync(destination, body);
	}
	fs.mkdirSync(path.join(app, 'node_modules'), { recursive: true });
	fs.symlinkSync(library, path.join(app, 'node_modules/observer'), 'dir');
	fs.symlinkSync(
		path.resolve(import.meta.dirname, '../node_modules/octane'),
		path.join(root, 'node_modules/octane'),
		'dir',
	);
	const out = path.join(app, 'src');
	const planner = createScopedStorePlanner(out, path.join(out, 'store-context.tsrx'));
	return {
		app,
		root,
		library,
		planner,
		plan: (name = 'useSnapshot', file = path.join(out, 'pane.tsx')) =>
			planner('observer', name, file),
	};
}

it('follows named aliases to a context-reading hook and shares the original neutral source', () => {
	const one = fixture(),
		two = fixture();
	const plan = one.plan(),
		relocated = two.plan();
	expect(plan.name).toBe('useChannel');
	for (const source of plan.files.values())
		expect(source.startsWith("'use no memo';\n")).toBe(true);
	expect(plan.isSharedExport('observer', 'valueOf', path.join(one.app, 'src/pane.tsx'))).toBe(true);
	expect(plan.isSharedExport('observer/core', 'valueOf', path.join(one.app, 'src/pane.tsx'))).toBe(
		true,
	);
	expect(plan.isSharedExport('observer', 'useSnapshot', path.join(one.app, 'src/pane.tsx'))).toBe(
		false,
	);
	expect(path.basename(plan.entry)).toBe(path.basename(relocated.entry));
	const raw = [...plan.files].find(([name]) => name.endsWith('-impl.ts'));
	expect(raw[1]).toContain('useStoreContext as readContext');
	expect(raw[1]).toContain('../node_modules/observer/state');
	expect(raw[1]).toContain('../node_modules/observer/renderer');
	expect(raw[1]).not.toContain(one.root);
	expect(plan.files.get(plan.entry)).toContain('bindStoreHook(implementations.useChannel)');
	expect([...plan.files.values()]).toEqual([...relocated.files.values()]);
	expect(fs.existsSync(plan.entry)).toBe(false);
});

it.each([
	[
		'a new module singleton',
		original.replace('export function', 'const state = new WeakMap(); export function'),
	],
	[
		'a hook escaping as a callback',
		original.replace('return valueOf(readContext(current));', 'return () => readContext(current);'),
	],
	[
		'a thenable passed to use',
		original.replace('readContext(current)', 'readContext(Promise.resolve(2))'),
	],
	[
		'a module-private function escaping',
		original
			.replace('export function', 'function saved(){return 1;} export function')
			.replace(
				'return valueOf(readContext(current));',
				'valueOf(readContext(current)); return saved;',
			),
	],
	[
		'a computed require',
		original.replace(
			'return valueOf(readContext(current));',
			'require(dynamicName); return valueOf(readContext(current));',
		),
	],
	[
		'a hook escaping through a shorthand property',
		original.replace(
			'return valueOf(readContext(current));',
			'valueOf(readContext(current)); return {readContext};',
		),
	],
	['an asynchronous hook', original.replace('export function', 'export async function')],
])('defers %s', (_reason, source) => {
	expect(fixture({ 'observer/react-hooks.ts': source }).plan()).toBeNull();
});

it('defers a mutable regular expression and an ambiguous relocated module', () => {
	expect(
		fixture({
			'observer/react-hooks.ts': 'const pattern=/x/g;\n' + original,
		}).plan(),
	).toBeNull();
	expect(
		fixture({
			'observer/react-hooks.ts': original.replace("'./state'", "'./state.mjs'"),
			'observer/public-store.ts': "export {valueOf} from './state.mjs';",
			'observer/state.mts': 'export function valueOf(x:number) {return x*2;}',
		}).plan(),
	).toBeNull();
});

it('inspects browser targets of dependencies reached through the neutral entry', () => {
	expect(
		fixture({
			'observer/state.ts':
				"import { inspect } from 'lookup'; export function valueOf(x:number) { return inspect(x); }",
			'node_modules/lookup/package.json': JSON.stringify({
				name: 'lookup',
				exports: { '.': { browser: './browser.js', default: './node.js' } },
			}),
			'node_modules/lookup/node.js': 'export function inspect(x) {return x;}',
			'node_modules/lookup/browser.js':
				"import {useState} from 'react'; export function inspect(x){return useState(x)[0];}",
		}).plan(),
	).toBeNull();
});

it('rejects a React dispatcher hidden behind a static CommonJS require', () => {
	expect(
		fixture({
			'observer/state.ts':
				"import { inspect } from 'lookup'; export function valueOf(x:number) { return inspect(x); }",
			'node_modules/lookup/package.json': '{"name":"lookup","main":"index.js"}',
			'node_modules/lookup/index.js':
				"const react=require('react'); exports.inspect=x=>react.useState(x)[0];",
		}).plan(),
	).toBeNull();
});

it('follows the actual linked workspace package when its dependency name is aliased', () => {
	const f = fixture({
		'app/package.json': JSON.stringify({
			dependencies: { observer: 'workspace:channel-core@*' },
		}),
		'observer/package.json': JSON.stringify({
			name: 'channel-core',
			version: '1.0.0',
			exports: { '.': './entry.ts', './core': './public-store.ts' },
		}),
	});
	expect(f.plan()?.name).toBe('useChannel');
});

it('audits the runtime JavaScript alongside a TypeScript substitution', () => {
	expect(
		fixture({
			'observer/state.ts': "export { valueOf } from './scalar.js';",
			'observer/scalar.ts': 'export function valueOf(x:number){return x}',
			'observer/scalar.js':
				"import {useState} from 'react'; export const valueOf = x => useState(x)[0];",
		}).plan(),
	).toBeNull();
});

it('defers a direct dependency when JS and TS siblings have different identities', () => {
	expect(
		fixture({
			'observer/react-hooks.ts': original.replace("'./state'", "'./state.js'"),
			'observer/state.js': 'export function valueOf(x){return x+1;}',
		}).plan(),
	).toBeNull();
});

it('keeps empty value imports inside the executable graph', () => {
	expect(
		fixture({
			'observer/public-store.ts': "export { valueOf } from './state'; import {} from './renderer';",
		}).plan(),
	).toBeNull();
});

it('requires an actual neutral shared export and a workspace link', () => {
	expect(
		fixture({
			'observer/public-store.ts': "export {current} from './renderer';",
		}).plan(),
	).toBeNull();
	expect(
		fixture({
			'app/package.json': '{"dependencies":{"observer":"^1.0.0"}}',
		}).plan(),
	).toBeNull();
});

it('checks resolution again for an importer shadowing a previously accepted package', () => {
	const f = fixture();
	expect(f.plan()).toBeTruthy();
	const dir = path.join(f.app, 'src', 'feature', 'node_modules', 'observer');
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"observer","main":"index.js"}');
	fs.writeFileSync(path.join(dir, 'index.js'), '');
	expect(f.plan('useSnapshot', path.join(f.app, 'src', 'feature', 'pane.tsx'))).toBeNull();
});

function project(overrides) {
	const replacements = {
		'app/package.json': JSON.stringify({
			type: 'module',
			dependencies: {
				observer: 'workspace:*',
				react: '19.2.7',
				'react-dom': '19.2.7',
				octane: '0.16.7',
			},
		}),
		'observer/package.json': JSON.stringify({
			name: 'observer',
			version: '1.0.0',
			peerDependencies: { react: '^19.2.0' },
			exports: { '.': './entry.ts', './core': './public-store.ts' },
		}),
		'app/tsconfig.json': JSON.stringify({
			compilerOptions: {
				strict: true,
				module: 'ESNext',
				moduleResolution: 'bundler',
				target: 'ESNext',
				lib: ['ESNext', 'DOM', 'DOM.Iterable'],
				jsx: 'react-jsx',
			},
		}),
		...overrides,
	};
	const f = fixture(replacements);
	const modules = path.join(f.root, 'node_modules');
	fs.rmSync(path.join(modules, 'react'), { recursive: true });
	for (const name of ['react', 'react-dom'])
		fs.symlinkSync(
			path.resolve(import.meta.dirname, '../node_modules', name),
			path.join(modules, name),
			'dir',
		);
	fs.mkdirSync(path.join(modules, '@types'));
	fs.symlinkSync(
		path.resolve(import.meta.dirname, '../../octane/node_modules/@types/react'),
		path.join(modules, '@types/react'),
		'dir',
	);
	return f;
}

it('previews, writes and reuses hook helpers without changing a linked dependency', async () => {
	const source = `import {useSnapshot as useReading, valueOf} from 'observer';
export function Pane() { const value = useReading(); return <p>{valueOf(1)}{value}</p>; }`;
	const originalPane = { 'app/src/pane.tsx': source };
	const { app, library } = project(originalPane);
	const originalSources = Object.fromEntries(
		fs.readdirSync(library).map((n) => [n, fs.readFileSync(path.join(library, n), 'utf8')]),
	);
	const migrate = (root, files, write = false) =>
		runCodemod(
			files.map((f) => path.join(root, f)),
			{ root, strong: true, write, verify: true },
		);
	const preview = await migrate(app, ['src/pane.tsx']);
	const converted = preview.files.find((f) => f.file === 'src/pane.tsx');
	expect(converted?.rules['store-hook']).toBe(1);
	expect(converted.code).toMatch(/import \{[^}]*useChannel as useReading[^}]*\} from/);
	expect(converted.code).toMatch(/import \{[^}]*valueOf[^}]*\} from ['"]observer['"]/);
	const helpers = preview.files.filter((f) => f.rules['store-hook-adapter']);
	expect(helpers.length).toBeGreaterThanOrEqual(4);
	expect(helpers.every((f) => !fs.existsSync(path.join(app, f.output)))).toBe(true);
	const written = await migrate(app, ['src/pane.tsx'], true);
	expect(written.files.find((f) => f.file === 'src/pane.tsx').code).toBe(converted.code);
	const checked = spawnSync(
		path.resolve(import.meta.dirname, '../../../node_modules/.bin/tsrx-tsc'),
		['--noEmit', '--skipLibCheck', '--project', 'tsconfig.json'],
		{ cwd: app, encoding: 'utf8' },
	);
	expect(checked.status, checked.stdout + checked.stderr).toBe(0);
	const helperBytes = Object.fromEntries(
		helpers.map((f) => [f.output, fs.readFileSync(path.join(app, f.output), 'utf8')]),
	);
	fs.writeFileSync(
		path.join(app, 'src/second.tsx'),
		source.replace('function Pane', 'function Other'),
	);
	// The normal directory entry now also sees the generated ordinary TypeScript files.
	const second = await migrate(app, ['src'], true);
	expect(second.files.find((f) => f.file === 'src/second.tsx')?.rules['store-hook']).toBe(1);
	for (const [file, bytes] of Object.entries(helperBytes))
		expect(fs.readFileSync(path.join(app, file), 'utf8')).toBe(bytes);
	expect(
		Object.fromEntries(
			fs.readdirSync(library).map((n) => [n, fs.readFileSync(path.join(library, n), 'utf8')]),
		),
	).toEqual(originalSources);
	const blocked = project(originalPane),
		conflict = path.join(blocked.app, helpers[0].output);
	fs.writeFileSync(conflict, '// already owned by the app\n');
	const independent = 'export function Footer() {return <footer>Contents</footer>}';
	fs.writeFileSync(path.join(blocked.app, 'src/footer.tsx'), independent);
	const failed = await migrate(blocked.app, ['src/pane.tsx', 'src/footer.tsx'], true);
	expect(fs.readFileSync(path.join(blocked.app, 'src/footer.tsx'), 'utf8')).toBe(independent);
	expect(
		failed.files
			.flatMap((f) => f.notes)
			.some((n) => n.rule === 'store-hook' && n.severity === 'error'),
	).toBe(true);
	expect(fs.readFileSync(path.join(blocked.app, 'src/pane.tsx'), 'utf8')).toBe(source);
	expect(fs.readFileSync(conflict, 'utf8')).toBe('// already owned by the app\n');
	expect(fs.readdirSync(path.join(blocked.app, 'src')).sort()).toEqual(
		[path.basename(conflict), 'footer.tsx', 'pane.tsx'].sort(),
	);
}, 30_000);

it('preserves the original handle and active store across client writes, provider changes and SSR', async () => {
	const { app } = project({
		'observer/public-store.ts': "export { valueOf, key } from './state';",
		'observer/state.ts':
			'export function valueOf<T>(x: T) { return x; } export function key(){return {};}',
		'observer/renderer.ts':
			"import {createContext} from 'react'; export const current = createContext(new Map<object, string>());",
		'app/src/handles.ts': "import {key} from 'observer/core'; export const reading = key();",
		'app/src/pane.tsx': `import {useSnapshot} from 'observer'; import {reading} from './handles';
			export function Pane() {
				const store = useSnapshot();
				return <button onClick={() => { store.set(reading, 'updated'); }}>{String(store.get(reading))}</button>;
			}`,
	});
	const input = path.join(app, 'src/pane.tsx');
	const result = await runCodemod([input], {
		root: app,
		strong: true,
		verify: true,
		write: true,
	});
	const pane = result.files.find((file) => file.file === 'src/pane.tsx');
	expect([...pane.notes, ...pane.diagnostics].filter((item) => item.severity === 'error')).toEqual(
		[],
	);
	expect(pane.rules['store-hook']).toBe(1);
	fs.writeFileSync(
		path.join(app, 'src/provider.tsrx'),
		`
		import {NativeStoreProvider} from './octane-store-context.tsrx';
		import {current} from '../../observer/renderer';
		import {Pane} from './pane.tsrx';
		export function Root({store}) @{ <NativeStoreProvider context={current} value={store}><Pane/></NativeStoreProvider> }`,
	);
	const entry = "export {Root} from './src/provider.tsrx'; export {reading} from './src/handles';";
	const dom = installDOM();
	try {
		const server = await bundleRuntime(
			app,
			'server',
			entry + "export {renderToString} from 'octane/server';",
		);
		const serverStore = new Map([[server.reading, 'server']]);
		expect(server.renderToString(server.Root, { store: serverStore }).html).toContain('server');
		expect(serverStore.get(server.reading)).toBe('server');
		const client = await bundleRuntime(
			app,
			'client',
			entry + "export {createRoot, act} from 'octane';",
		);
		const host = document.createElement('div');
		const root = client.createRoot(host);
		try {
			const first = new Map([[client.reading, 'first']]);
			const second = new Map([[client.reading, 'second']]);
			for (const [store, expected] of [
				[first, 'first'],
				[second, 'second'],
			]) {
				await client.act(async () => root.render(client.Root, { store }));
				expect(host.textContent).toBe(expected);
				await client.act(async () => host.querySelector('button').click());
				expect(store.get(client.reading)).toBe('updated');
				expect(store.size).toBe(1);
			}
			await client.act(async () => root.render(client.Root, { store: first }));
			expect(host.textContent).toBe('updated');
		} finally {
			await client.act(async () => root.unmount());
		}
	} finally {
		dom.window.close();
		vi.unstubAllGlobals();
	}
}, 30_000);

it('requires an imported application handle to come from the original shared factory', async () => {
	const { storeInputFactories } = await import('../dist/store-inputs.js');
	const { app, plan } = fixture({
		'app/src/handles.ts': `import {valueOf as make} from 'observer/core';
			import {useSnapshot as other} from 'observer';
			export const reading = make(1), unknown = other();`,
	});
	const factory = storeInputFactories(app, null);
	const planned = plan();
	const accepts = (name) => {
		const target = factory(path.join(app, 'src/pane.tsx'), './handles', name);
		return !!target && planned.isSharedExport(target.module, target.name, target.from);
	};
	expect(accepts('reading')).toBe(true);
	expect(accepts('unknown')).toBe(false);
	fs.writeFileSync(path.join(app, 'src/handles.js'), 'export const reading = {};');
	expect(factory(path.join(app, 'src/pane.tsx'), './handles.js', 'reading')).toBeNull();
	expect(factory(path.join(app, 'src/pane.tsx'), './handles', 'reading')).toBeNull();
	expect(accepts('missing')).toBe(false);
});

it('follows named input aliases to their original factory and defers ambiguous targets', async () => {
	const { storeInputFactories } = await import('../dist/store-inputs.js');
	const { app, root, plan } = fixture({
		'app/src/handles.ts':
			"import {valueOf as make} from 'observer/core'; const created=make(1);export {created as reading};",
		'app/src/barrel.ts': "export {reading as alias} from './handles';",
		'app/src/public.ts':
			"import {alias as local} from './barrel';export {local as source};export type {alias as typeOnly} from './barrel';",
		'app/src/star.ts': "export * from './handles';",
		'app/src/a.ts': "export {loop} from './b';",
		'app/src/b.ts': "export {loop} from './a';",
		'app/src/other.ts': "export {reading} from './handles';",
		'app/src/other.js': 'export const reading = null;',
		'app/src/shadow.ts': "export {reading} from '~/other.js';",
		'node_modules/channels/package.json': '{"name":"channels","main":"index.js"}',
		'node_modules/channels/index.js': 'exports.reading=null;',
		'app/src/bare-shadow.ts': "export {reading} from 'channels';",
	});
	const factory = storeInputFactories(app, {
		baseUrl: app,
		paths: { '~/*': ['src/*'], channels: ['src/handles.ts'] },
	});
	const from = path.join(app, 'src/pane.tsx');
	const target = factory(from, './public', 'source');
	expect(target && plan().isSharedExport(target.module, target.name, target.from)).toBe(true);
	for (const [module, name] of [
		['./public', 'typeOnly'],
		['./star', 'reading'],
		['./a', 'loop'],
		['./shadow', 'reading'],
		['./bare-shadow', 'reading'],
	]) {
		expect(factory(from, module, name)).toBeNull();
	}
	const external = path.join(root, 'external.ts');
	fs.writeFileSync(
		external,
		"import {valueOf} from 'observer/core'; export const result=valueOf(1);",
	);
	fs.symlinkSync(external, path.join(app, 'src/link.ts'));
	expect(factory(from, './link', 'result')).toBeNull();
});

it('emits identical companions from parent and nested links to the same workspace package', () => {
	const { app, library, plan: outer } = fixture();
	const feature = path.join(app, 'src/feature');
	fs.mkdirSync(path.join(feature, 'node_modules'), { recursive: true });
	fs.symlinkSync(library, path.join(feature, 'node_modules/observer'), 'dir');
	fs.writeFileSync(
		path.join(feature, 'package.json'),
		JSON.stringify({ dependencies: { observer: 'workspace:*' } }),
	);
	const file = path.join(feature, 'leaf.tsx');
	const nestedFirst = createScopedStorePlanner(
		path.join(app, 'src'),
		path.join(app, 'src/store-context.tsrx'),
	);
	const nested = nestedFirst('observer', 'useSnapshot', file),
		parent = outer();
	expect(nested?.files).toEqual(parent?.files);
	expect(nested?.files.size).toBeGreaterThan(0);
	fs.writeFileSync(
		path.join(feature, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: { moduleResolution: 'bundler', module: 'esnext', preserveSymlinks: true },
		}),
	);
	const preserved = createScopedStorePlanner(
		path.join(app, 'src'),
		path.join(app, 'src/store-context.tsrx'),
	);
	expect(preserved('observer', 'useSnapshot', file)).toBeNull();
	// The project entry point supplies root compiler options even for nested callers.
	const rootOptions = createScopedStorePlanner(
		path.join(app, 'src'),
		path.join(app, 'src/store-context.tsrx'),
		{
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
		},
	);
	expect(rootOptions('observer', 'useSnapshot', file)).toBeNull();
});

it('keeps the React compiler from inserting a React dispatcher into native hooks', async () => {
	const { transformSync } = await import('@babel/core');
	const { plan } = fixture({
		'observer/react-hooks.ts': `import {useContext} from 'react';
			import {current} from './renderer';
			import {valueOf} from './state';
			export function useChannel(label) {
				const value = useContext(current);
				return [valueOf(value), label];
			}`,
	});
	const source = [...plan().files].find(([file]) => file.endsWith('-impl.ts'))[1];
	const compile = (code) =>
		transformSync(code, {
			filename: 'use-row.js',
			configFile: false,
			babelrc: false,
			plugins: [['babel-plugin-react-compiler', { target: '19' }]],
		}).code;
	expect(compile(source)).not.toContain('react/compiler-runtime');
	expect(compile(source.replace("'use no memo';", ''))).toContain('react/compiler-runtime');
});
