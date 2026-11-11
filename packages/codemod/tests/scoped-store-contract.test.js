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

it('preserves the original handle and passes the active store to unchanged helpers at effect and click time', async () => {
	const { app } = project({
		'observer/public-store.ts': "export { valueOf, key } from './state';",
		'observer/state.ts':
			'export function valueOf<T>(x: T) { return x; } export function key(){return {};}',
		'observer/renderer.ts':
			"import {createContext} from 'react'; export const current = createContext(new Map<object, string>());",
		'app/src/handles.ts': "import {key} from 'observer/core'; export const reading = key();",
		'app/src/records.ts': 'export const calls = new WeakMap<Map<object, string>, string[]>();',
		'app/src/record.ts': `import {calls} from './records'; export {calls};
			export function record(store: Map<object, string>, phase: string) {
				calls.set(store, [...(calls.get(store) ?? []), phase]);
			}`,
		'app/src/pane.tsx': `import {useSnapshot} from 'observer'; import {reading} from './handles';
			import {useEffect, useLayoutEffect} from 'react'; import {record as publish} from './record';
			export function Pane() {
				const store = useSnapshot();
				useEffect(() => { publish(store, 'effect'); }, [store]);
				useLayoutEffect(() => { return () => { publish(store, 'cleanup'); }; }, [store]);
				return <button onClick={() => { publish(store, 'click'); store.set(reading, 'updated'); }}>{String(store.get(reading))}</button>;
			}`,
	});
	const input = path.join(app, 'src/pane.tsx');
	const helper = path.join(app, 'src/record.ts');
	const originalHelper = fs.readFileSync(helper);
	fs.copyFileSync(input, path.join(app, 'src/reference.tsx'));
	const result = await runCodemod([input, helper], {
		root: app,
		strong: true,
		verify: true,
		write: true,
	});
	expect(fs.readFileSync(helper)).toEqual(originalHelper);
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
	const entry = `export {Root} from './src/provider.tsrx'; export {reading} from './src/handles';
		export {calls} from './src/record'; export {current} from '../observer/renderer';
		export {Pane as Reference} from './src/reference.tsx';`;
	const dom = installDOM();
	try {
		const { createElement, act } = await import('react');
		const { createRoot } = await import('react-dom/client');
		const { renderToStaticMarkup } = await import('react-dom/server');
		const reference = (module, store) =>
			createElement(module.current.Provider, { value: store }, createElement(module.Reference));
		const server = await bundleRuntime(
			app,
			'server',
			entry + "export {renderToString} from 'octane/server';",
		);
		const serverStore = new Map([[server.reading, 'server']]);
		const parsed = document.createElement('template');
		parsed.innerHTML = server.renderToString(server.Root, { store: serverStore }).html;
		expect(parsed.content.querySelector('button').textContent).toBe('server');
		const expected = document.createElement('template');
		expected.innerHTML = renderToStaticMarkup(reference(server, serverStore));
		expect(parsed.content.textContent).toBe(expected.content.textContent);
		expect(server.calls.has(serverStore)).toBe(false);
		expect(serverStore.get(server.reading)).toBe('server');
		const client = await bundleRuntime(
			app,
			'client',
			entry + "export {createRoot, act} from 'octane';",
		);
		const host = document.createElement('div');
		const root = client.createRoot(host);
		const reactHost = document.createElement('div');
		const reactRoot = createRoot(reactHost);
		try {
			const first = new Map([[client.reading, 'first']]);
			const second = new Map([[client.reading, 'second']]);
			const firstReact = new Map(first);
			const secondReact = new Map(second);
			for (const [store, reactStore, expected] of [
				[first, firstReact, 'first'],
				[second, secondReact, 'second'],
			]) {
				await client.act(async () => root.render(client.Root, { store }));
				await act(async () => reactRoot.render(reference(client, reactStore)));
				expect(host.textContent).toBe(expected);
				expect(host.textContent).toBe(reactHost.textContent);
				await client.act(async () => host.querySelector('button').click());
				await act(async () => reactHost.querySelector('button').click());
				expect(store.get(client.reading)).toBe('updated');
				expect(store.get(client.reading)).toBe(reactStore.get(client.reading));
				expect(store.size).toBe(1);
				expect(client.calls.get(store)).toEqual(['effect', 'click']);
				expect(client.calls.get(store)).toEqual(client.calls.get(reactStore));
			}
			expect(client.calls.get(first)).toEqual(['effect', 'click', 'cleanup']);
			expect(client.calls.get(first)).toEqual(client.calls.get(firstReact));
			await client.act(async () => root.render(client.Root, { store: first }));
			expect(host.textContent).toBe('updated');
		} finally {
			await client.act(async () => root.unmount());
			await act(async () => reactRoot.unmount());
		}
	} finally {
		dom.window.close();
		vi.unstubAllGlobals();
	}
}, 30_000);

function noticePane(statement, pragma = '') {
	return `${pragma}
		import {useSnapshot} from 'observer';
		import {reading} from './handles';
		import {Notice as Label} from 'notices';
		export function Pane() {
			const store = useSnapshot();
			return <button onClick={() => { ${statement} }}>Send</button>;
		}`;
}

function noticeProject(files) {
	return project({
		'observer/public-store.ts': "export {valueOf, key} from './state';",
		'observer/state.ts':
			'export function valueOf<T>(x:T) { return x; } export function key() { return {}; }',
		'observer/renderer.ts':
			"import {createContext} from 'react'; export const current = createContext(new Map());",
		'app/src/handles.ts': "import {key} from 'observer/core'; export const reading = key();",
		'node_modules/notices/package.json': JSON.stringify({
			name: 'notices',
			main: 'index.js',
			type: 'module',
			peerDependencies: { react: '^19' },
		}),
		'node_modules/notices/index.js': `import {createContext, createElement, useContext} from 'react';
			export const Prefix = createContext('default');
			export function Action({onClick}) { return createElement('button', {onClick}, 'Send'); }
			export function Notice({label}) { return createElement('b', null, useContext(Prefix) + label); }`,
		...files,
	});
}

it('defers workspace helpers when the renderer, arguments, callee or returned value can change behavior', async () => {
	const click = (call) => `return <button onClick={() => { ${call}; }}/>;`;
	const cases = {
		render: ['./render-read', 'run(store); return <button/>;'],
		memo: ['./render-read', 'useMemo(() => run(store), [store]); return <button/>;'],
		'called-prop': [
			'./render-read',
			'const button = <button onClick={() => {run(store);}}/>; button.props.onClick(); return <i/>;',
		],
		'called-builder': [
			'./render-read',
			'function Build() { return <button onClick={() => {run(store);}}/>; } Build().props.onClick(); return <i/>;',
		],
		composite: ['./command', 'return <Action onClick={() => { run(store); }}/>;'],
		named: [
			'./command',
			'const handleClick = () => { run(store); }; return <button onClick={handleClick}/>;',
		],
		opaque: ['vendor-command', click('run(store)')],
		reexport: ['./barrel', click('run(store)')],
		sibling: ['./split', click('run(store)')],
		payload: ['./command', click('run(store, make(<b/>))')],
		escape: ['./command', click('consume(run(store))')],
	};
	const inputs = Object.fromEntries(
		Object.entries(cases).map(([name, [from, body]]) => [
			'app/src/' + name + '.tsx',
			`import {useSnapshot} from 'observer'; import {useMemo} from 'react'; import {Action} from 'notices';
			import {run} from '${from}';
			export function Pane({make, consume}) { const store = useSnapshot(); ${body} }`,
		]),
	);
	inputs['app/src/asserted.tsx'] =
		`import {useSnapshot} from 'observer'; import {run} from './command';
		export function Pane({name}: {name:string}) { const store = useSnapshot(); return <button onClick={() => {run(store,name);}}/>; }`;
	inputs['app/src/nested/leaf.tsx'] =
		`import {useSnapshot} from 'observer'; import {useEffect} from 'react'; import {run} from '../command';
		export function Pane() { const store = useSnapshot(); useEffect(() => {run(store);}, [store]); return <b/>; }`;
	const command =
		'export function run(store: Map<string, unknown>, payload?: unknown) { store.set("last", payload); return store; }';
	const { app } = noticeProject({
		...inputs,
		'app/src/asserted-caller.tsx': `import {Pane} from './asserted';
			export function App() { return <Pane name={<i/> as unknown as string}/>; }`,
		'app/src/nested/tsconfig.json': JSON.stringify({
			extends: '../../tsconfig.json',
			compilerOptions: { paths: { react: ['./eager.ts'] } },
		}),
		'app/src/nested/eager.ts': 'export function useEffect(callback: () => void) { callback(); }',
		'app/src/command.ts': command,
		'app/src/barrel.ts': "export {run} from './command';",
		'app/src/split.ts': command,
		'app/src/split.js': 'export function run() { return null; }',
		'node_modules/vendor-command/package.json':
			'{"name":"vendor-command","type":"module","main":"index.js","types":"index.d.ts"}',
		'node_modules/vendor-command/index.js': 'export function run(store) { return store; }',
		'node_modules/vendor-command/index.d.ts': 'export function run<T>(store:T):T;',
		'app/src/render-read.ts':
			"import {useId} from 'react'; export function run(store: Map<string, unknown>) {return store.get(useId());}",
	});
	const names = Object.keys(inputs).map((name) => path.relative('app', name));
	const { files } = await runCodemod(
		[...names, 'src/asserted-caller.tsx'].map((name) => path.join(app, name)),
		{ root: app, strong: true, verify: true, projectTypes: true },
	);
	for (const name of names) {
		const pane = files.find((file) => file.file === name);
		expect(pane.rules['store-hook'], name).toBeUndefined();
		expect(pane.notes, name).toContainEqual(
			expect.objectContaining({ severity: 'error', message: expect.stringContaining('observer') }),
		);
	}
}, 30_000);

it.each([
	['re-export', "export {View} from './view';", 'registry'],
	['class base', "export class View extends (await import('./relay')).View {}", 'relay'],
])(
	'defers a store helper when its %s reaches a migrated component',
	async (_edge, registry, reexport) => {
		const { app } = project({
			'observer/state.ts': 'export function valueOf<T>(x: T) { return x; }',
			'observer/renderer.ts':
				"import {createContext} from 'react'; export const current = createContext(new Map<string, string>());",
			'app/src/pane.tsx': `import {useSnapshot} from 'observer'; import {run} from './command';
			export function Pane() {
				const store = useSnapshot();
				return <button onClick={() => { run(store); }}>Render</button>;
			}`,
			'app/src/command.ts': `import {createElement} from 'react';
			import {renderToStaticMarkup} from 'react-dom/server';
			import {View} from './registry';
			export function run(store) { store.set('html', renderToStaticMarkup(createElement(View))); }`,
			'app/src/registry.ts': registry,
			'app/src/relay.ts': "export {View} from './view';",
			'app/src/view.tsx': 'export function View() { return <b>original</b>; }',
		});
		const { files } = await runCodemod(
			['pane.tsx', 'registry.ts', 'relay.ts', 'view.tsx'].map((name) =>
				path.join(app, 'src', name),
			),
			{ root: app, strong: true, verify: true, write: false },
		);
		const pane = files.find((file) => file.file === 'src/pane.tsx');
		expect(files.find((file) => file.file === 'src/view.tsx').output).toBe('src/view.tsrx');
		expect(files.find((file) => file.file === `src/${reexport}.ts`).code).toContain('./view.tsrx');
		expect(pane.notes).toContainEqual(
			expect.objectContaining({
				rule: 'bindings',
				severity: 'error',
				message: expect.stringContaining('useSnapshot'),
			}),
		);
	},
);

it('delivers the original React element to a store service for rendering under its eventual provider', async () => {
	const { app, root: workspace } = noticeProject({
		'app/src/pane.tsx': `import {useSnapshot} from 'observer'; import {reading} from './handles';
			import {Action, Notice as Label} from 'notices';
			import {FormattedMessage as Message, useIntl} from 'react-intl';
			export function Pane({wait}) {
				const store = useSnapshot();
				const intl = useIntl();
				const command = {async send() {
					await wait;
					void store.get(reading).show(intl.formatMessage({id:'title'}));
				}};
				return <section><Message id="headline"/><Action onClick={() => {
					store.get(reading).show(<Label label="sent"/>, {sticky: true});
					store.get(reading).show(<Message id="headline"/>);
				}}/><button onClick={() => {void command.send();}}>Later</button></section>;
			}`,
	});
	fs.symlinkSync(
		path.resolve(import.meta.dirname, '../node_modules/react-intl'),
		path.join(workspace, 'node_modules/react-intl'),
		'dir',
	);
	const input = path.join(app, 'src/pane.tsx');
	const result = await runCodemod([input], {
		root: app,
		strong: true,
		verify: true,
		write: true,
		projectTypes: true,
	});
	const pane = result.files.find((file) => file.file === 'src/pane.tsx');
	expect(pane.rules['store-hook']).toBe(1);
	expect(pane.rules['react-intl']).toBe(1);
	expect([...pane.notes, ...pane.diagnostics].filter((item) => item.severity === 'error')).toEqual(
		[],
	);
	fs.writeFileSync(
		path.join(app, 'src/provider.tsrx'),
		`
		import {NativeStoreProvider} from './octane-store-context.tsrx';
		import {current} from '../../observer/renderer';
		import {IntlProvider} from './octane-react-intl.tsrx';
		import {Pane} from './pane.tsrx';
		export function Root({store, wait, messages, rich}) @{ <NativeStoreProvider context={current} value={store}><IntlProvider locale="en" messages={messages} defaultRichTextElements={rich}><Pane wait={wait}/></IntlProvider></NativeStoreProvider> }`,
	);
	const dom = installDOM();
	try {
		const client = await bundleRuntime(
			app,
			'client',
			`
			export {Root} from './src/provider.tsrx';
			export {reading} from './src/handles';
			export {createRoot} from 'octane';
			export {Notice, Prefix} from 'notices';
			export {IntlProvider, FormattedMessage} from 'react-intl';
			export {act, isValidElement, createElement} from 'react';
			export {renderToStaticMarkup} from 'react-dom/server';`,
			['react-intl'],
		);
		const show = vi.fn();
		const host = document.createElement('div');
		const root = client.createRoot(host);
		try {
			let release;
			const wait = new Promise((done) => {
				release = done;
			});
			const props = {
				store: new Map([[client.reading, { show }]]),
				wait,
				messages: { headline: 'Octane provider', title: 'Before <rich>switch</rich>' },
				rich: { rich: (chunks) => client.createElement('em', null, chunks) },
			};
			await client.act(async () => root.render(client.Root, props));
			expect(host.textContent).toBe('Octane providerSendLater');
			expect(show).not.toHaveBeenCalled();
			await client.act(async () => host.querySelector('button').click());
			expect(show).toHaveBeenCalledTimes(2);
			const [element, options] = show.mock.calls[0];
			expect(client.isValidElement(element)).toBe(true);
			expect(element.type).toBe(client.Notice);
			expect(element.props).toEqual({ label: 'sent' });
			expect(options).toEqual({ sticky: true });
			expect(
				client.renderToStaticMarkup(
					client.createElement(client.Prefix.Provider, { value: 'later: ' }, element),
				),
			).toBe('<b>later: sent</b>');
			const [message] = show.mock.calls[1];
			expect(message.type).toBe(client.FormattedMessage);
			expect(
				client.renderToStaticMarkup(
					client.createElement(
						client.IntlProvider,
						{ locale: 'en', messages: { headline: 'React provider' } },
						message,
					),
				),
			).toBe('React provider');
			await client.act(async () => host.querySelectorAll('button')[1].click());
			const nextShow = vi.fn();
			await client.act(async () =>
				root.render(client.Root, {
					...props,
					store: new Map([[client.reading, { show: nextShow }]]),
					messages: { headline: 'Switched', title: 'After switch' },
				}),
			);
			expect(show).toHaveBeenCalledTimes(2);
			await client.act(async () => release());
			expect(show).toHaveBeenCalledTimes(3);
			expect(client.renderToStaticMarkup(show.mock.calls[2][0])).toBe('Before <em>switch</em>');
			expect(nextShow).not.toHaveBeenCalled();
		} finally {
			await client.act(async () => root.unmount());
		}
	} finally {
		dom.window.close();
		vi.unstubAllGlobals();
	}
}, 30_000);

it('keeps formatted service results behind their original receiver and completed await', async () => {
	const msg = "intl.formatMessage({id:'title'})";
	const deliver = (value = msg, service = 'store.get(reading)', options = '') =>
		service + '.show(' + value + options + ')';
	const rows = {
		render: deliver() + ';',
		eager: 'return <button onClick={()=>{' + deliver() + ';}}/>;',
		effect: 'useEffect(()=>{' + deliver() + ';},[]);',
		catch: 'try{await tick()}catch{' + deliver() + ';}',
		conditional: 'if(ready)await tick();' + deliver() + ';',
		field: 'await tick();class A{b=class {static {' + deliver() + ';}}};publish(A);',
		payload: 'await tick();' + deliver("intl.formatMessage({id:'title'},{tag:<b/>})") + ';',
		input: 'await tick();' + deliver('intl.formatMessage(make())') + ';',
		handle: 'await tick();' + deliver(msg, 'store.get(other)') + ';',
		sibling: 'await tick();' + deliver(msg, undefined, ',{done:()=>null}') + ';',
		spread: 'await tick();' + deliver(msg, undefined, ',...other') + ';',
		result: 'await tick();publish(' + deliver() + ');',
	};
	const inputs = Object.fromEntries(
		Object.entries(rows).map(([name, body]) => [
			'app/src/' + name + '.tsx',
			`${name === 'eager' ? '/** @jsxImportSource eager-factory */' : ''}
		import {useSnapshot} from 'observer'; import {reading} from './handles'; import {useIntl} from 'react-intl';
		import {useEffect} from 'react';
		export function Pane({other,tick,ready,publish,make}) {const store=useSnapshot(); const intl=useIntl();
			${['render', 'effect', 'eager'].includes(name) ? body : 'const action={async send(){' + body + '}};'}
			return <i/>;}`,
		]),
	);
	const { app, root } = noticeProject(inputs);
	fs.symlinkSync(
		path.resolve(import.meta.dirname, '../node_modules/react-intl'),
		path.join(root, 'node_modules/react-intl'),
		'dir',
	);
	const { files } = await runCodemod(
		Object.keys(inputs).map((f) => path.join(root, f)),
		{ root: app, strong: true, verify: true, projectTypes: true },
	);
	for (const file of files.filter(
		(f) => f.file.startsWith('src/') && Object.hasOwn(inputs, 'app/' + f.file),
	))
		expect(file.notes, file.file).toContainEqual(
			expect.objectContaining({ severity: 'error', message: expect.stringContaining('useIntl') }),
		);
}, 30_000);

it('retains the migration diagnostic when a store consumer cannot preserve the original React descriptor', async () => {
	const deliver = (argument) => `store.get(reading).show(${argument});`;
	const valid = deliver('<Label label="sent"/>');
	const cases = {
		mixed: noticePane(valid + ' store.get(reading).show(<i/>);'),
		'unknown-handle': noticePane('store.get({}).show(<Label/>);'),
		'wrong-receiver': noticePane('store.get(reading).replace().show(<Label/>);'),
		'linked-tag': noticePane(valid).replace("'notices'", "'linked-notices'"),
		'mapped-tag': noticePane(valid).replace("'notices'", "'notices/public.js'"),
		alias: noticePane('const Copy = Label; ' + deliver('<Copy/>')),
		shadow: noticePane('{const Label = () => <i/>; ' + deliver('<Label/>') + '}'),
		local: noticePane('function Local() {return <i/>;} ' + deliver('<Local/>')),
		children: noticePane(deliver('<Label>sent</Label>')),
		spread: noticePane(deliver('<Label {...config}/>')),
		opaque: noticePane(deliver('<Label label={compute()}/>')),
		classic: noticePane(valid, '/** @jsxRuntime classic */'),
		custom: noticePane(valid, '/** @jsxImportSource custom-renderer */'),
	};
	const inputs = Object.fromEntries(
		Object.entries(cases).map(([name, source]) => ['app/src/' + name + '.tsx', source]),
	);
	inputs['app/src/island.tsx'] =
		`import {Action, Notice} from 'notices'; import {useSnapshot} from 'observer';
		import {reading} from './handles'; declare function other(value: unknown): void;
		export function Pane() {
			const store = useSnapshot();
			return <Action onClick={() => { store.get(reading).show(<Notice/>); other(<i/>); }}/>;
		}`;
	const { app, root } = noticeProject({
		...inputs,
		'app/src/widgets/package.json': JSON.stringify({
			name: 'linked-notices',
			main: 'index.tsx',
			peerDependencies: { react: '^19' },
		}),
		'app/src/widgets/index.tsx': 'export function Notice() { return <i/>; }',
		'node_modules/notices/public.js': "export {Notice} from './index.js';",
	});
	fs.symlinkSync(
		path.join(app, 'src/widgets'),
		path.join(app, 'node_modules/linked-notices'),
		'dir',
	);
	const config = path.join(app, 'tsconfig.json');
	const options = JSON.parse(fs.readFileSync(config, 'utf8'));
	options.compilerOptions.paths = { 'notices/public.js': ['./src/widgets/index.tsx'] };
	fs.writeFileSync(config, JSON.stringify(options));
	const files = Object.keys(inputs).map((name) => path.join(root, name));
	const result = await runCodemod(files, { root: app, strong: true, verify: true });
	const island = result.files.find((file) => file.file === 'src/island.tsx');
	expect(island.rules['store-hook']).toBe(1);
	expect(island.notes).toContainEqual(
		expect.objectContaining({ severity: 'error', message: expect.stringContaining('<Action>') }),
	);
	for (const name of Object.keys(cases)) {
		const file = result.files.find((file) => file.file === 'src/' + name + '.tsx');
		expect(file.rules['store-hook'], name).toBeUndefined();
		expect(file.notes, name).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					severity: 'error',
					message: expect.stringContaining('observer'),
				}),
			]),
		);
	}
}, 30_000);

it.each([
	['react', 'react-jsx'],
	['react-jsx', 'react'],
])(
	'keeps the diagnostic when the root and nearest project use %s and %s',
	async (rootJsx, nearestJsx) => {
		const { app } = noticeProject({
			'app/src/pane.tsx': noticePane('store.get(reading).show(<Label label="sent"/>);'),
			'app/src/tsconfig.json': JSON.stringify({
				extends: '../tsconfig.json',
				compilerOptions: { jsx: nearestJsx },
			}),
		});
		const config = path.join(app, 'tsconfig.json');
		const root = JSON.parse(fs.readFileSync(config, 'utf8'));
		root.compilerOptions.jsx = rootJsx;
		fs.writeFileSync(config, JSON.stringify(root));
		const result = await runCodemod([path.join(app, 'src/pane.tsx')], {
			root: app,
			strong: true,
			verify: true,
		});
		const pane = result.files.find((file) => file.file === 'src/pane.tsx');
		expect(pane.rules['store-hook']).toBeUndefined();
		expect(pane.notes).toContainEqual(
			expect.objectContaining({ severity: 'error', message: expect.stringContaining('observer') }),
		);
	},
);

it('requires an imported application handle to come from the original shared factory', async () => {
	const { storeSources } = await import('../dist/store-inputs.js');
	const { app, plan } = fixture({
		'app/src/handles.ts': `import {valueOf as make} from 'observer/core';
			import {useSnapshot as other} from 'observer';
			export const reading = make(1), unknown = other();`,
	});
	const { inputFactory: factory } = storeSources(app, null, () => false);
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
	const { storeSources } = await import('../dist/store-inputs.js');
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
	const { inputFactory: factory } = storeSources(
		app,
		{
			baseUrl: app,
			paths: { '~/*': ['src/*'], channels: ['src/handles.ts'] },
		},
		() => false,
	);
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

it('keeps the receiver-specific bare SVG diagnostics when other slots in the same store consumer are proven', async () => {
	const asset = '<svg><path d="M0 0L1 1"/></svg>';
	const { app } = project({
		'app/src/accepted.svg': asset,
		'app/src/nested.svg': asset,
		'app/src/named.svg': asset,
		'app/src/pane.tsx': `import {useSnapshot} from 'observer';
			import Accepted from './accepted.svg';
			import Nested from './nested.svg';
			import Named from './named.svg';
			import {Opaque} from 'foreign-renderer';
			function Native({children}) { return <button>{children}</button>; }
			function Button({children}) { return <Opaque>{children}</Opaque>; }
			function Row({icon}) { return <Opaque icon={icon}/>; }
			export function Pane() {
				const value = useSnapshot();
				return <main><Native><Accepted/></Native><Button><Nested/></Button><Row icon={<Named/>}/>{value}</main>;
			}`,
	});
	const { files } = await runCodemod([path.join(app, 'src/pane.tsx')], {
		root: app,
		strong: true,
		verify: true,
		svgPaths: true,
	});
	const pane = files.find((f) => f.file === 'src/pane.tsx');
	expect(pane.rules['store-hook']).toBe(1);
	expect(pane.rules['svg-paths']).toBe(1);
	const notes = pane.notes.filter((n) => n.severity === 'error' && n.message.includes('bare SVG'));
	expect(notes).toHaveLength(2);
	expect(notes.map((n) => n.message)).toEqual([
		expect.stringMatching(/<Button> renders its children/),
		expect.stringMatching(/<Row> renders its icon prop/),
	]);
	expect(files.filter((f) => f.output.endsWith('.svg.octane.ts')).map((f) => f.output)).toEqual([
		'src/accepted.svg.octane.ts',
	]);
});
