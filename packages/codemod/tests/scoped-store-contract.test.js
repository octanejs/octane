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

it.each([
	['0.17.0', true],
	['0.18.0', false],
])('gates the generated adapters on installed Octane %s', async (version, supported) => {
	const { app, root } = project({
		'app/src/pane.tsx': `import {useSnapshot} from 'observer';
		import {useIntl} from 'react-intl';
		export function Pane() {
			const value = useSnapshot();
			const intl = useIntl();
			return <p>{String(value)}{intl.formatNumber(1234)}</p>;
		}`,
	});
	const original = fs.realpathSync(path.join(root, 'node_modules/octane'));
	const installed = path.join(app, 'node_modules/octane');
	const manifest = JSON.parse(fs.readFileSync(path.join(original, 'package.json'), 'utf8'));
	fs.mkdirSync(installed);
	fs.writeFileSync(path.join(installed, 'package.json'), JSON.stringify({ ...manifest, version }));
	fs.symlinkSync(path.join(original, 'src'), path.join(installed, 'src'), 'dir');
	fs.symlinkSync(
		path.resolve(import.meta.dirname, '../node_modules/react-intl'),
		path.join(app, 'node_modules/react-intl'),
		'dir',
	);

	const result = await runCodemod([path.join(app, 'src/pane.tsx')], {
		root: app,
		strong: true,
		verify: true,
		write: false,
	});
	const pane = result.files.find((file) => file.file === 'src/pane.tsx');
	expect(pane.strong).toBe(true);
	const errors = [...pane.notes, ...pane.diagnostics].filter(
		(finding) => finding.severity === 'error',
	);
	expect(errors.map((finding) => finding.rule)).toEqual(
		supported ? ['bindings'] : ['bindings', 'bindings'],
	);
	if (supported) expect(errors[0].message).toContain('this formatNumber call');
	const expectedHelpers = ['src/octane-react-intl.tsrx', 'src/octane-store-context.tsrx'];
	const helpers = result.files
		.map((file) => file.output)
		.filter((output) => expectedHelpers.includes(output));
	expect(helpers.sort()).toEqual(supported ? expectedHelpers : []);
});

it('warns at a direct migrated server call that needs a standalone store provider', async () => {
	const rootImport = `import { renderToString } from 'react-dom/server';
			import DefaultPane, { Pane, Plain, Conditional, Props, Destructured } from './pane.tsx';
			import AnonymousPane from './anonymous.tsx';`;
	const { app } = project({
		'app/src/pane.tsx': `import { useSnapshot } from 'observer';
			export function Pane() { const value = useSnapshot(); return <b>{String(value)}</b>; }
			export function Plain() { return <b>plain</b>; }
			export function Props(props: { label?: string }) {
				const value = useSnapshot();
				return <b>{props.label ?? String(value)}</b>;
			}
			export function Destructured({ label = 'label' }: { label?: string }) {
				const value = useSnapshot();
				return <b>{label}{String(value)}</b>;
			}
			export default function DefaultPane() {
				const value = useSnapshot();
				return <b>{String(value)}</b>;
			}
			export function Conditional() {
				if (typeof window === 'undefined') return <b>server</b>;
				const value = useSnapshot();
				return <b>{String(value)}</b>;
			}`,
		'app/src/anonymous.tsx': `import { useSnapshot } from 'observer';
			export default function () {
				const value = useSnapshot();
				return <b>{String(value)}</b>;
			}`,
		'app/src/root.tsx':
			rootImport +
			`
			export const html = renderToString(<Pane />);
			export const plain = renderToString(<Plain />);
			export const conditional = renderToString(<Conditional />);
			export const props = renderToString(<Props />);
			export const destructured = renderToString(<Destructured />);
			export const defaultPane = renderToString(<DefaultPane />);
			export const anonymousPane = renderToString(<AnonymousPane />);`,
		'app/src/hosted.tsx': `import { OctaneCompat } from 'octane/react/server';
			import { Pane } from './pane.tsx';
			export function Hosted() { return <OctaneCompat component={Pane} />; }`,
		'app/src/deferred.tsx':
			rootImport +
			`
			export function render() { return renderToString(<Pane />); }`,
	});
	const result = await runCodemod(
		['root', 'pane', 'anonymous', 'deferred'].map((name) => path.join(app, 'src', name + '.tsx')),
		{ root: app, strong: true, verify: true, write: true },
	);
	const findings = result.files.flatMap((file) =>
		file.notes
			.filter((note) => note.rule === 'store-hook' && note.severity === 'warning')
			.map((note) => ({ file: file.file, ...note })),
	);
	expect(findings).toEqual([
		expect.objectContaining({
			file: 'src/root.tsx',
			line: 4,
			message: expect.stringMatching(/standalone.*NativeStoreProvider/i),
		}),
		expect.objectContaining({
			file: 'src/root.tsx',
			line: 7,
			message: expect.stringMatching(/migrated Props.*NativeStoreProvider/),
		}),
		expect.objectContaining({
			file: 'src/root.tsx',
			line: 8,
			message: expect.stringMatching(/migrated Destructured.*NativeStoreProvider/),
		}),
		expect.objectContaining({
			file: 'src/root.tsx',
			line: 9,
			message: expect.stringMatching(/migrated default export.*NativeStoreProvider/),
		}),
		expect.objectContaining({
			file: 'src/root.tsx',
			line: 10,
			message: expect.stringMatching(/migrated default export.*NativeStoreProvider/),
		}),
	]);
	expect(fs.existsSync(path.join(app, 'src/root.tsrx'))).toBe(true);
	const hosted = fs.readFileSync(path.join(app, 'src/hosted.tsx'), 'utf8');
	expect(hosted).toContain("from './pane.tsrx'");
	expect(hosted).toContain('<OctaneCompat component={Pane} />');
});

it('warns at existing standalone client roots when the migrated hook reads context', async () => {
	const mount = `import { createRoot as mount } from 'octane';
		import * as Octane from 'octane';
		import { Pane, Plain } from './pane.tsx';
		import { Pane as Other } from './other/pane.tsx';
		export const errors: unknown[] = [];
		const options = { onUncaughtError: (error: unknown) => errors.push(error), onRecoverableError: (error: unknown) => errors.push(error) };
		export const render = (host: HTMLElement) => mount(host, options).render(Pane);
		export const hydrate = (host: HTMLElement) => Octane.hydrateRoot(host, Pane, undefined, options);
		export function deferred(host: HTMLElement, replacement: ReturnType<typeof mount>) {
			mount(host).render(Plain);
			mount(host).render(Other);
			const unused = mount(host);
			let root = mount(host);
			root = replacement;
			root.render(Pane);
			const fake = (target: HTMLElement, body: typeof Pane) => body;
			const hydrateRoot = fake;
			hydrateRoot(host, Pane);
		}`;
	const { app } = project({
		'observer/react-hooks.ts': original.replace(
			'return valueOf(readContext(current));',
			'if (valueOf(0) === 0) return 42; return valueOf(readContext(current));',
		),
		'app/src/pane.tsx': `import { useSnapshot } from 'observer';
			export function Pane() { const value = useSnapshot(); return <b>{String(value)}</b>; }
			export function Plain() { return <b>plain</b>; }`,
		'app/src/other/pane.tsx': 'export function Pane() { return <b>other</b>; }',
		'app/src/client.ts': mount,
		'app/src/unverified/client.ts': `import { hydrateRoot } from 'octane';
			import { Pane } from '../pane.tsx';
			export const hydrate = (host: HTMLElement) => hydrateRoot(host, Pane);`,
		'app/src/unverified/node_modules/octane/package.json': JSON.stringify({
			name: 'octane',
			version: '0.17.0',
			exports: { '.': { types: './index.d.ts', import: './runtime.mjs' } },
		}),
		'app/src/unverified/node_modules/octane/index.d.ts':
			'export function hydrateRoot(host: HTMLElement, body: unknown): void;',
		'app/src/unverified/node_modules/octane/runtime.mjs': 'export function hydrateRoot() {}',
	});
	const leaf = path.join(app, 'src/pane.tsx');
	const host = path.join(app, 'src/client.ts');
	const options = { root: app, strong: true, verify: true };
	const { files } = await runCodemod([leaf], { ...options, write: false });
	const client = files.find((file) => file.file === 'src/client.ts');
	expect(files.find((file) => file.file === 'src/unverified/client.ts')?.notes).toEqual([]);
	expect(client.notes).toEqual(
		[7, 8].map((line) => ({
			rule: 'store-hook',
			severity: 'warning',
			line,
			message: expect.stringMatching(
				/If the migrated Pane's store hook reads context.*NativeStoreProvider/,
			),
		})),
	);
	expect(fs.readFileSync(host, 'utf8')).toBe(mount);
	expect(fs.existsSync(path.join(app, 'src/pane.tsrx'))).toBe(false);
	const written = await runCodemod([leaf], { ...options, write: true });
	expect(written.files.find((file) => file.file === 'src/client.ts')?.notes).toEqual(client.notes);
	expect(fs.readFileSync(host, 'utf8')).toBe(mount.replace('./pane.tsx', './pane.tsrx'));
	const pane = written.files.find((file) => file.file === 'src/pane.tsx');
	expect(pane.rules['store-hook']).toBe(1);
	expect([...pane.notes, ...pane.diagnostics].filter((note) => note.severity === 'error')).toEqual(
		[],
	);

	const dom = installDOM();
	try {
		const { renderToString, Pane } = await bundleRuntime(
			app,
			'server',
			"export { renderToString } from 'octane/server'; export { Pane } from './src/pane.tsrx';",
		);
		const { hydrate, errors } = await bundleRuntime(
			app,
			'client',
			"export { hydrate, errors } from './src/client';",
		);
		const hydrated = document.createElement('div');
		hydrated.innerHTML = renderToString(Pane).html;
		const before = hydrated.firstElementChild;
		const root = hydrate(hydrated);
		try {
			expect(hydrated.textContent).toBe('42');
			expect(hydrated.firstElementChild).toBe(before);
			expect(errors).toEqual([]);
		} finally {
			root.unmount();
		}
	} finally {
		dom.window.close();
		vi.unstubAllGlobals();
	}
}, 30_000);

it('previews, writes and reuses hook helpers without changing a linked dependency', async () => {
	const source = `import {useSnapshot as useReading, valueOf} from 'observer';
export function Pane() { const value = useReading(); return <p>{valueOf(1)}{value}</p>; }
export type PaneParameters = Parameters<typeof Pane>;`;
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
	fs.writeFileSync(path.join(app, 'src/second.tsx'), source.replaceAll('Pane', 'Other'));
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

it.each([
	['a method assignment', 'reading.resolve = () => 2;', false],
	[
		'a method assignment to a type-asserted handle',
		'(reading as any).resolve = () => 2;',
		false,
		'export const reading = create(3) as unknown as number;',
	],
	[
		'a method assignment to the original handle behind an exported alias',
		'original.resolve = () => 2;',
		false,
		'const original = create(3); const alias = original; export const reading = alias as unknown as number;',
	],
	[
		'a computed assignment through an alias',
		'const alias = reading; alias["resolve"] = () => 2;',
		false,
	],
	['Object.assign', 'Object.assign(reading, { resolve: () => 2 });', false],
	[
		'a property definition',
		'Object.defineProperty(reading, "resolve", { value: () => 2 });',
		false,
	],
	['Reflect.set', 'Reflect.set(reading, "resolve", () => 2);', false],
	['Reflect.set with a separate receiver', 'Reflect.set({}, "resolve", () => 2, reading);', false],
	['a property deletion', 'delete reading.resolve;', false],
	['a property update', 'reading.version++;', false],
	['a read', 'reading.resolve?.();', true],
	['a write on a separate handle', 'const other = create(4); other.resolve = () => 2;', true],
	[
		'an imported name that shadows Reflect',
		'import { readOnlyTools as Reflect } from "./read-only-tools"; Reflect.set(reading, "resolve", () => 2);',
		true,
	],
	[
		'a shadowing parameter',
		'function update(reading: { resolve: () => number }) { reading.resolve = () => 2; }',
		true,
	],
])(
	'checks the original store handle after %s',
	async (_label, use, migrated, setup = 'export const reading = create(3);') => {
		const { app } = project({
			'observer/public-store.ts': "export { valueOf, create } from './state';",
			'observer/state.ts': `type Handle = { resolve?: () => number; version: number };
			export function create(value: number): Handle { return { resolve: () => value, version: 0 }; }
			export function valueOf(base: number, handle: Handle) { return base + (handle.resolve?.() ?? handle.version); }`,
			'observer/react-hooks.ts': `import {use} from 'react'; import {current} from './renderer';
			import {create, valueOf} from './state';
			export function useChannel(handle: ReturnType<typeof create>) { return valueOf(use(current), handle); }`,
			'app/src/reading.ts': `import { create } from 'observer/core'; ${setup} ${use}`,
			'app/src/read-only-tools.ts':
				'export const readOnlyTools = { set(value: unknown, _key: string, _next: unknown) { return value; } };',
			'app/src/pane.tsx': `import {useSnapshot} from 'observer'; import {reading} from './reading';
			export function Pane() { return <p>{String(useSnapshot(reading))}</p>; }`,
		});
		const result = await runCodemod([path.join(app, 'src/pane.tsx')], {
			root: app,
			strong: true,
			verify: true,
			write: false,
		});
		const pane = result.files.find((file) => file.file === 'src/pane.tsx');
		expect(Boolean(pane.rules['store-hook'])).toBe(migrated);
		expect(pane.notes.some((note) => note.rule === 'bindings' && note.severity === 'error')).toBe(
			!migrated,
		);
	},
);

it('defers store arguments carrying JSX from a converted producer through unchanged relays', async () => {
	const pane = (setup, value = 'id') => `import { useSnapshot } from 'observer';
${setup}
export function Pane() { return <p>{useSnapshot({ id: ${value} })}</p>; }`;
	const relayed = [
		'destructured',
		'returned',
		'projected',
		'scalar',
		'conditional',
		'inspected',
		'discarded',
		'retained',
		'nested',
	];
	const { app } = project({
		'observer/react-hooks.ts': `import {use} from 'react'; import {current} from './renderer';
import {valueOf} from './state';
export function useChannel(key: {id: string}) { return valueOf(use(current)) + ':' + key.id; }`,
		'app/src/producer.tsx': `const badge = <b/> as unknown as string;
export type bag = { badge: string; scalar: string };
export const bag: bag = { badge, scalar: 'safe' };
export const { badge: destructured } = bag;
const readBadge = () => bag.badge;
export const returned = readBadge();
export const conditional = badge ? 'safe' : 'missing';
export const inspected = typeof badge;
export const discarded = (badge, 'safe');
export type Label = string;
export default badge;`,
		'app/src/unchanged.tsx':
			"import type { Label } from './producer.tsx'; export const retained = <b/> as unknown as Label;",
		'app/src/nested/tsconfig.json': '{"extends":"../../tsconfig.json"}',
		'app/src/nested/original.tsx': 'export const nested = <b/> as unknown as string;',
		'app/src/relay.ts': `import { bag } from './producer';
export { destructured, returned, conditional, inspected, discarded } from './producer';
export { retained } from './unchanged';
export { nested } from './nested/original';
export const projected = bag.badge;
export const scalar = bag.scalar;`,
		...Object.fromEntries(
			relayed.map((name) => [
				'app/src/' + name + '.tsx',
				pane(`import { ${name} as id } from './relay';`),
			]),
		),
		'app/src/defaultArg.tsx': pane("import id from './producer';"),
		'app/src/namespaceArg.tsx': pane("import * as source from './producer';", 'source.bag.badge'),
		'app/src/discardedArg.tsx': pane(
			"import { bag } from './producer'; const select = (_label: string, value: string) => value;",
			"select(bag.badge, 'safe')",
		),
	});
	const rejected = ['destructured', 'returned', 'projected', 'defaultArg', 'namespaceArg'];
	const accepted = [
		'scalar',
		'conditional',
		'inspected',
		'discarded',
		'retained',
		'nested',
		'discardedArg',
	];
	const result = await runCodemod(
		['producer', ...rejected, ...accepted].map((name) => path.join(app, 'src', name + '.tsx')),
		{ root: app, strong: true, verify: true, projectTypes: true, write: false },
	);
	for (const name of rejected) {
		const file = result.files.find((entry) => entry.file === 'src/' + name + '.tsx');
		expect(file.notes).toContainEqual(
			expect.objectContaining({ rule: 'bindings', severity: 'error' }),
		);
	}
	for (const name of accepted) {
		const file = result.files.find((entry) => entry.file === 'src/' + name + '.tsx');
		expect(file.rules['store-hook']).toBe(1);
		expect(
			[...file.notes, ...file.diagnostics].filter((item) => item.severity === 'error'),
		).toEqual([]);
	}
});

it('follows wildcard re-exports of store arguments from a converted JSX producer', async () => {
	const pane = (module, name = 'value', value = 'id') => `import { useSnapshot } from 'observer';
import { ${name} as id } from './${module}';
export function Pane() { return <p>{useSnapshot({ id: ${value} })}</p>; }`;
	const rejected = {
		wildcard: pane('cycle-b'),
		typeShadow: pane('type-shadow'),
		ambiguous: pane('ambiguous'),
		namespace: pane('namespace', 'inner', 'id.value'),
		nestedNamespace: pane('namespace-barrel', 'inner', 'id.value'),
		namespaceDefault: pane('namespace-barrel', 'inner', 'id.default'),
	};
	const accepted = {
		scalar: pane('cycle-b', 'scalar'),
		explicit: pane('explicit'),
		unchanged: pane('stable-barrel'),
		typed: pane('type-star'),
		namespaceScalar: pane('namespace-barrel', 'inner', 'id.scalar'),
		defaultValue: `import { useSnapshot } from 'observer';
import * as exports from './default-barrel';
export function Pane() {
	const id = (exports as unknown as { default: string }).default;
	return <p>{useSnapshot({ id: id })}</p>;
}`,
	};
	const { app } = project({
		'observer/react-hooks.ts': `import {use} from 'react'; import {current} from './renderer';
import {valueOf} from './state';
export function useChannel(key: {id: string}) { return valueOf(use(current)) + ':' + key.id; }`,
		'app/src/producer.tsx': `export const value = <b/> as unknown as string;
export const scalar = 'safe';
export default value;`,
		'app/src/original.tsx': 'export const value = <i/> as unknown as string;',
		'app/src/plain.ts': "export const value = 'safe';",
		'app/src/cycle-a.ts': "export * from './cycle-b'; export * from './producer';",
		'app/src/cycle-b.ts': "export * from './cycle-a';",
		'app/src/type-shadow.ts': "export * from './producer'; export type value = string;",
		'app/src/ambiguous.ts': "export * from './producer'; export * from './plain';",
		'app/src/explicit.ts': "export * from './producer'; export { value } from './plain';",
		'app/src/stable-barrel.ts': "export * from './original';",
		'app/src/type-star.ts': "export type * from './producer'; export * from './plain';",
		'app/src/namespace.ts': "export * as inner from './producer';",
		'app/src/namespace-barrel.ts': "export * from './namespace';",
		'app/src/default-barrel.ts': "export * from './producer';",
		...Object.fromEntries(
			Object.entries({ ...rejected, ...accepted }).map(([name, code]) => [
				'app/src/' + name + '.tsx',
				code,
			]),
		),
	});
	const result = await runCodemod(
		['producer', ...Object.keys(rejected), ...Object.keys(accepted)].map((name) =>
			path.join(app, 'src', name + '.tsx'),
		),
		{ root: app, strong: true, verify: true, projectTypes: true, write: false },
	);
	for (const name of Object.keys(rejected)) {
		const file = result.files.find((entry) => entry.file === 'src/' + name + '.tsx');
		expect(file.notes).toContainEqual(
			expect.objectContaining({ rule: 'bindings', severity: 'error' }),
		);
	}
	for (const name of Object.keys(accepted)) {
		const file = result.files.find((entry) => entry.file === 'src/' + name + '.tsx');
		expect(file.rules['store-hook']).toBe(1);
		expect(
			[...file.notes, ...file.diagnostics].filter((item) => item.severity === 'error'),
		).toEqual([]);
	}
});

it('preserves the active store and aliased handle through effects, Effect Events and clicks', async () => {
	const { app } = project({
		'observer/public-store.ts': "export { valueOf, key } from './state';",
		'observer/state.ts':
			'export function valueOf<T>(x: T) { return x; } export function key(){return {};}',
		'observer/renderer.ts':
			"import {createContext} from 'react'; export const current = createContext(new Map<object, string>());",
		'app/src/handles.ts':
			"import {key as create} from 'observer/core'; const canonical=create(), same=canonical; export {canonical}; export const reading=same, cleaned=create();",
		'app/src/records.ts': 'export const calls = new WeakMap<Map<object, string>, string[]>();',
		'app/src/record.ts': `import {calls} from './records'; export {calls};
			export function record(store: Map<object, string>, phase: string) {
				calls.set(store, [...(calls.get(store) ?? []), phase]);
			}`,
		'app/src/pane.tsx': `import {useSnapshot} from 'observer'; import {reading, cleaned} from './handles';
			import {useEffect, useEffectEvent as effectEvent, useLayoutEffect, useState} from 'react';
			import {record as publish} from './record';
			export function Pane() {
				const store = useSnapshot();
				const [text, setText] = useState('');
				const update = effectEvent(() => { store.set(reading, 'after effect'); });
				const clean = effectEvent(() => { store.set(cleaned, 'cleanup event'); });
				useEffect(() => {
					publish(store, 'effect');
					setText(String(store.get(reading)));
					update();
				}, [store]);
				useLayoutEffect(() => { return () => { publish(store, 'cleanup'); clean(); }; }, [store]);
				return <button onClick={() => { publish(store, 'click'); store.set(reading, 'updated'); }}>{text}</button>;
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
	const entry = `export {Root} from './src/provider.tsrx'; export {canonical as reading, cleaned} from './src/handles';
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
		expect(parsed.content.querySelector('button').textContent).toBe('');
		const expected = document.createElement('template');
		expected.innerHTML = renderToStaticMarkup(reference(server, serverStore));
		expect(parsed.content.textContent).toBe(expected.content.textContent);
		expect(server.calls.has(serverStore)).toBe(false);
		expect(serverStore.get(server.reading)).toBe('server');
		expect(serverStore.has(server.cleaned)).toBe(false);
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
				expect(store.get(client.reading)).toBe('after effect');
				expect(store.get(client.reading)).toBe(reactStore.get(client.reading));
				await client.act(async () => host.querySelector('button').click());
				await act(async () => reactHost.querySelector('button').click());
				expect(store.get(client.reading)).toBe('updated');
				expect(store.get(client.reading)).toBe(reactStore.get(client.reading));
				expect(store.get(client.cleaned)).toBe(reactStore.get(client.cleaned));
				expect(store.size).toBe(reactStore.size);
				expect(client.calls.get(store)).toEqual(['effect', 'click']);
				expect(client.calls.get(store)).toEqual(client.calls.get(reactStore));
			}
			expect(first.has(client.cleaned)).toBe(false);
			expect(second.get(client.cleaned)).toBe('cleanup event');
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

const installedDescriptor = `export const Descriptor = { tag: 'report' };`;
const descriptorCall = 'service.emit(Descriptor, { count: 3 });';
const descriptorEffect = `useEffect(() => { ${descriptorCall} }, [service]);`;

function descriptorPane(body, module = 'descriptors') {
	return `import {useSnapshot} from 'observer';
		import {Descriptor} from '${module}';
		import {useEffect} from 'react';
		export function Pane() {
			const service = useSnapshot();
			${body}
			return <p>Ready</p>;
		}`;
}

function descriptorProject(files) {
	return project({
		'observer/state.ts': 'export function valueOf<T>(x: T) { return x; }',
		'observer/renderer.ts': `import {createContext} from 'react';
			export const current = createContext({ emit(_descriptor: unknown, _payload: unknown) {} });`,
		'node_modules/descriptors/package.json': JSON.stringify({
			name: 'descriptors',
			exports: { './*': './*.ts' },
		}),
		'node_modules/descriptors/report.ts': `import type {Metadata} from './metadata';
			export enum Channel { Application = 'app' }
			export const Descriptor = { tag: 'report' } satisfies Metadata;`,
		'node_modules/descriptors/metadata.ts': 'export interface Metadata { tag: string }',
		...files,
	});
}

it('defers store reads in instance fields that can run after effect setup', async () => {
	const cases = {
		escaped: 'class Later { value = store.label; } publish(Later);',
		anonymous: 'publish(class { value = store.label; });',
		staticEscape: 'class Later { value = store.label; static { publish(Later); } }',
		immediateStatic: 'class Now { static value = store.label; } void Now.value;',
		immediateBlock: 'class Now { static { void store.label; } }',
		computedName: 'class Now { [store.label] = 1; } publish(Now);',
	};
	const { app } = project({
		'observer/state.ts': 'export function valueOf<T>(value: T) { return value; }',
		'observer/renderer.ts':
			"import {createContext} from 'react'; export const current = createContext({label: 'base'});",
		'app/src/receiver.ts':
			'export function publish(value: object) { Object.assign(globalThis, {published: value}); }',
		...Object.fromEntries(
			Object.entries(cases).map(([name, body]) => [
				'app/src/' + name + '.tsx',
				`import {useSnapshot} from 'observer'; import {useEffect} from 'react';
import {publish} from './receiver';
export function Pane() {
	const store = useSnapshot();
	useEffect(() => { ${body} }, [store]);
	return <b>ready</b>;
}`,
			]),
		),
	});
	const result = await runCodemod(
		Object.keys(cases).map((name) => path.join(app, 'src', name + '.tsx')),
		{ root: app, strong: true, verify: true, projectTypes: true, write: false },
	);
	for (const name of ['escaped', 'anonymous', 'staticEscape']) {
		const file = result.files.find((entry) => entry.file === 'src/' + name + '.tsx');
		expect(file.notes, name).toContainEqual(
			expect.objectContaining({ rule: 'bindings', severity: 'error' }),
		);
	}
	for (const name of ['immediateStatic', 'immediateBlock', 'computedName']) {
		const file = result.files.find((entry) => entry.file === 'src/' + name + '.tsx');
		expect(file.rules['store-hook'], name).toBe(1);
		expect(
			[...file.notes, ...file.diagnostics].filter((note) => note.severity === 'error'),
			name,
		).toEqual([]);
	}
});

it('passes an installed data descriptor by identity to the active store during effect setup', async () => {
	const { app } = descriptorProject({
		'app/src/pane.tsx': descriptorPane(descriptorEffect, 'descriptors/report'),
	});
	const { files } = await runCodemod([path.join(app, 'src/pane.tsx')], {
		root: app,
		strong: true,
		verify: true,
		projectTypes: true,
		write: true,
	});
	const pane = files.find((file) => file.file === 'src/pane.tsx');
	expect(pane.strong).toBe(true);
	expect([...pane.notes, ...pane.diagnostics].filter((item) => item.severity === 'error')).toEqual(
		[],
	);
	fs.writeFileSync(
		path.join(app, 'src/provider.tsrx'),
		`import {NativeStoreProvider} from './octane-store-context.tsrx';
		import {current} from '../../observer/renderer';
		import {Pane} from './pane.tsrx';
		export function Root({store}) @{ <NativeStoreProvider context={current} value={store}><Pane/></NativeStoreProvider> }`,
	);
	const entry = `export {Root} from './src/provider.tsrx';
		export {Descriptor} from 'descriptors/report';`;
	const dom = installDOM();
	try {
		const server = await bundleRuntime(
			app,
			'server',
			entry + `export {renderToString} from 'octane/server';`,
		);
		const serverStore = { emit: vi.fn() };
		expect(server.renderToString(server.Root, { store: serverStore }).html).toContain('Ready');
		expect(serverStore.emit).not.toHaveBeenCalled();
		const client = await bundleRuntime(
			app,
			'client',
			entry + `export {act, createRoot} from 'octane';`,
		);
		const host = document.createElement('div');
		const root = client.createRoot(host);
		try {
			for (const tag of ['report', 'replacement']) {
				client.Descriptor.tag = tag;
				const store = { emit: vi.fn((descriptor) => descriptor.tag) };
				await client.act(async () => root.render(client.Root, { store }));
				expect(host.textContent).toBe('Ready');
				expect(store.emit).toHaveBeenCalledExactlyOnceWith(client.Descriptor, { count: 3 });
				expect(store.emit.mock.calls[0][0]).toBe(client.Descriptor);
				expect(store.emit.mock.contexts[0]).toBe(store);
				expect(store.emit).toHaveReturnedWith(tag);
			}
		} finally {
			await client.act(async () => root.unmount());
		}
	} finally {
		dom.window.close();
		vi.unstubAllGlobals();
	}
}, 30_000);

it('defers imported JSX in descriptor call payloads and preserves the selected scalar field', async () => {
	const pane = (value, imports) =>
		`import {${imports}} from './descriptor-payload'; ${descriptorPane(
			descriptorEffect.replace('count: 3', 'count: ' + value),
			'descriptors/report',
		)}`;
	const cases = {
		named: pane('badge', 'badge'),
		projected: pane('payload.badge', 'payload'),
		scalar: pane('payload.scalar', 'payload'),
	};
	const { app } = descriptorProject({
		'app/src/descriptor-payload.tsx': `export const badge = <b/> as unknown as string;
			export const payload = {badge, scalar: 'ready'};`,
		...Object.fromEntries(
			Object.entries(cases).map(([name, source]) => ['app/src/' + name + '.tsx', source]),
		),
	});
	const { files } = await runCodemod(
		['descriptor-payload', ...Object.keys(cases)].map((name) =>
			path.join(app, 'src', name + '.tsx'),
		),
		{ root: app, strong: true, verify: true, projectTypes: true, write: false },
	);
	for (const name of ['named', 'projected']) {
		const file = files.find((entry) => entry.file === 'src/' + name + '.tsx');
		expect(file.rules['store-hook']).toBeUndefined();
		expect(file.notes).toContainEqual(
			expect.objectContaining({ rule: 'bindings', severity: 'error' }),
		);
	}
	const scalar = files.find((entry) => entry.file === 'src/scalar.tsx');
	expect(scalar.rules['store-hook']).toBe(1);
	expect(
		[...scalar.notes, ...scalar.diagnostics].filter((note) => note.severity === 'error'),
	).toEqual([]);
});

it('defers descriptor calls with uncertain evaluation, object shape, or package identity', async () => {
	const cases = {
		render: descriptorPane(descriptorCall, 'descriptors/report'),
		returnValue: descriptorPane(
			'useEffect(() => service.emit(Descriptor, { count: 3 }), [service]);',
			'descriptors/report',
		),
		classField: descriptorPane(
			'useEffect(() => { class Later { value = service.emit(Descriptor, { count: 3 }); } queueMicrotask(() => new Later()); }, [service]);',
			'descriptors/report',
		),
		jsx: descriptorPane(descriptorEffect.replace('count: 3', 'view: <b/>'), 'descriptors/report'),
		getter: descriptorPane(descriptorEffect, 'descriptors/getter'),
		dataAlias: descriptorPane(descriptorEffect, 'descriptors/alias'),
		executableImport: descriptorPane(descriptorEffect, 'inline-type-descriptors'),
		local: descriptorPane(descriptorEffect, './local-descriptor'),
		conditional: descriptorPane(descriptorEffect, 'conditional-descriptors'),
		legacy: descriptorPane(descriptorEffect, 'legacy-descriptors/metadata'),
	};
	const { app, root } = descriptorProject({
		...Object.fromEntries(
			Object.entries(cases).map(([name, source]) => [`app/src/${name}.tsx`, source]),
		),
		'app/src/local-descriptor.ts': installedDescriptor,
		'node_modules/descriptors/getter.ts': `export const Descriptor = { get tag() { return 'report'; } };`,
		'node_modules/descriptors/alias.ts': `const tag = 'report'; export const Descriptor = { tag: tag };`,
		'node_modules/inline-type-descriptors/package.json': JSON.stringify({
			name: 'inline-type-descriptors',
			exports: './index.ts',
		}),
		'node_modules/inline-type-descriptors/index.ts': `import {type Metadata} from './metadata';
			export const Descriptor = { tag: 'report' } satisfies Metadata;`,
		'node_modules/inline-type-descriptors/metadata.ts':
			'globalThis.descriptorMetadataLoaded = true; export interface Metadata { tag: string }',
		'node_modules/conditional-descriptors/package.json': JSON.stringify({
			name: 'conditional-descriptors',
			exports: { import: './index.ts', require: './alias.ts' },
		}),
		'node_modules/conditional-descriptors/index.ts': installedDescriptor,
		'node_modules/legacy-descriptors/package.json': JSON.stringify({ name: 'legacy-descriptors' }),
		'node_modules/legacy-descriptors/metadata/package.json': JSON.stringify({
			main: './server.ts',
			module: './client.ts',
		}),
		'node_modules/legacy-descriptors/metadata/server.ts': installedDescriptor,
		'node_modules/legacy-descriptors/metadata/client.ts': installedDescriptor.replace(
			'report',
			'browser',
		),
	});
	fs.symlinkSync('index.ts', path.join(root, 'node_modules/conditional-descriptors/alias.ts'));
	const { files } = await runCodemod(
		Object.keys(cases).map((name) => path.join(app, `src/${name}.tsx`)),
		{ root: app, strong: true, verify: true, projectTypes: true },
	);
	for (const name of Object.keys(cases)) {
		const pane = files.find((file) => file.file === `src/${name}.tsx`);
		expect(pane.notes, name).toContainEqual(
			expect.objectContaining({ rule: 'bindings', severity: 'error' }),
		);
	}
}, 30_000);

it.each([
	['render-time calls', { run: 'useEffect(() => update(), []); update();' }],
	['click-time calls', { run: '', output: '<button onClick={() => update()}>Send</button>' }],
	['an escaped callback', { run: 'useEffect(() => queueMicrotask(update), []);' }],
	[
		'a call in a deferred class field',
		{
			run: 'useEffect(() => { class Deferred { value = update(); } queueMicrotask(() => new Deferred()); }, []);',
		},
	],
	[
		'a store write in a deferred class field',
		{
			body: 'class Deferred { value = void store.set(reading, 1); } queueMicrotask(() => new Deferred());',
		},
	],
	[
		'an effect owned by a nested component',
		{
			run: 'function Child() { useEffect(() => update(), []); return <p />; }',
			output: '<Child />',
		},
	],
	['a shadowed Effect Event hook', { setup: 'const useEffectEvent = (callback) => callback;' }],
	['a shadowed effect hook', { setup: 'const useEffect = (callback) => callback();' }],
	['React JSX store data', { body: 'store.set(reading, <b />);' }],
])(
	'defers scoped-store Effect Events with %s',
	async (
		_name,
		{
			setup = '',
			run = 'useEffect(() => update(), []);',
			output = '<p />',
			body = 'store.set(reading, 1);',
		},
	) => {
		const { app } = project({
			'observer/public-store.ts': "export { valueOf, key } from './state';",
			'observer/state.ts':
				'export function valueOf<T>(x: T) { return x; } export function key() { return {}; }',
			'observer/renderer.ts':
				"import {createContext} from 'react'; export const current = createContext(new Map<object, number>());",
			'app/src/handles.ts': "import {key} from 'observer/core'; export const reading = key();",
			'app/src/pane.tsx': `import {useSnapshot} from 'observer'; import {reading} from './handles';
			import {useEffect, useEffectEvent} from 'react';
			export function Pane() {
				${setup}
				const store = useSnapshot();
				const update = useEffectEvent(() => { ${body} });
				${run}
				return ${output};
			}`,
		});
		const result = await runCodemod([path.join(app, 'src/pane.tsx')], {
			root: app,
			strong: true,
			verify: true,
			write: false,
		});
		const pane = result.files.find((file) => file.file === 'src/pane.tsx');
		expect(pane.notes.some((note) => note.rule === 'bindings' && note.severity === 'error')).toBe(
			true,
		);
	},
);

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
			import {Notice as Label} from 'notices';
			import {FormattedMessage as Message} from 'react-intl';
			export function Pane() {
				const store = useSnapshot();
				return <section><Message id="headline"/><button onClick={() => {
					store.get(reading).show(<Label label="sent"/>, {sticky: true});
					store.get(reading).show(<Message id="headline"/>);
				}}>Send</button></section>;
			}`,
	});
	fs.symlinkSync(
		path.resolve(import.meta.dirname, '../node_modules/react-intl'),
		path.join(workspace, 'node_modules/react-intl'),
		'dir',
	);
	const input = path.join(app, 'src/pane.tsx');
	const result = await runCodemod([input], { root: app, strong: true, verify: true, write: true });
	const pane = result.files.find((file) => file.file === 'src/pane.tsx');
	expect(pane.rules['store-hook']).toBe(1);
	expect(pane.rules['react-intl']).toBe(1);
	expect([...pane.notes, ...pane.diagnostics].filter((item) => item.severity === 'error')).toEqual([
		expect.objectContaining({
			rule: 'bindings',
			line: 6,
			message: expect.stringContaining('generated native adapter'),
		}),
	]);
	fs.writeFileSync(
		path.join(app, 'src/provider.tsrx'),
		`
		import {NativeStoreProvider} from './octane-store-context.tsrx';
		import {current} from '../../observer/renderer';
		import {IntlProvider} from './octane-react-intl.tsrx';
		import {Pane} from './pane.tsrx';
		export function Root({store}) @{ <NativeStoreProvider context={current} value={store}><IntlProvider locale="en" messages={{headline:'Octane provider'}}><Pane/></IntlProvider></NativeStoreProvider> }`,
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
			await client.act(async () =>
				root.render(client.Root, { store: new Map([[client.reading, { show }]]) }),
			);
			expect(host.textContent).toBe('Octane providerSend');
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
		} finally {
			await client.act(async () => root.unmount());
		}
	} finally {
		dom.window.close();
		vi.unstubAllGlobals();
	}
}, 30_000);

it('retains the React Intl diagnostic for deferred calls into an opaque store service', async () => {
	const service = "await wait; void store.get(reading).show(intl.formatMessage({ id: 'title' }));";
	const bodies = {
		renderStarted: `const assets = { async load() { ${service} } };
			begin(assets.load);
			return <b>Ready</b>;`,
		click: `return <button onClick={async () => { ${service} }}>Load</button>;`,
	};
	const inputs = Object.fromEntries(
		Object.entries(bodies).map(([name, body]) => [
			'app/src/' + name + '.tsx',
			`import { useSnapshot } from 'observer';
			import { useIntl } from 'react-intl';
			import { reading } from './handles';
			export function Pane({ begin, wait }) {
				const store = useSnapshot();
				const intl = useIntl();
				${body}
			}`,
		]),
	);
	const { app, root } = noticeProject(inputs);
	fs.symlinkSync(
		path.resolve(import.meta.dirname, '../node_modules/react-intl'),
		path.join(root, 'node_modules/react-intl'),
		'dir',
	);
	const { files } = await runCodemod(
		Object.keys(inputs).map((file) => path.join(root, file)),
		{ root: app, strong: true, verify: true, projectTypes: true },
	);
	for (const name of Object.keys(bodies)) {
		const result = files.find((file) => file.file === `src/${name}.tsx`);
		expect(result.notes, name).toContainEqual(
			expect.objectContaining({
				rule: 'bindings',
				severity: 'error',
				message: expect.stringContaining('useIntl'),
			}),
		);
	}
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
	expect(island.rules['store-hook']).toBeUndefined();
	expect(island.notes).toContainEqual(
		expect.objectContaining({ severity: 'error', message: expect.stringContaining('observer') }),
	);
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

it('defers store factory inputs linked to React work during a read', async () => {
	const panes = {
		direct: './handles',
		wrapped: './handles',
		parenthesized: './handles',
		mutated: './handles',
		escaped: './handles',
		escapedIndirect: './handles',
		escapedAlias: './handles',
		alias: './handles',
		calleeAlias: './handles',
		snapshot: './snapshot-key',
		nested: './barrel',
		viaTsx: './tsx-handle',
		viaJs: './js-handle',
		viaSibling: './sibling-handle',
		viaDirectory: './directory-handle',
		plain: './handles',
		pure: './pure',
		explicitJs: './explicit-js-key',
		portalOnly: './portal-key',
	};
	const { app } = project({
		'observer/public-store.ts':
			"export {valueOf, select, selectOptions, read, replace} from './state';",
		'observer/state.ts': `const readings = new Map<string, () => string>();
			export function valueOf<T>(value: T) {return value;}
			export function select(read: () => string): string {
				const key = String(readings.size);
				readings.set(key, read);
				return key;
			}
			export function selectOptions(options: {read?: () => string}) {
				return select(() => options.read?.() ?? 'ready');
			}
			export function replace(key: string, read: () => string) {readings.set(key, read);}
			export function read(key: string) {return readings.get(key)!();}`,
		'observer/renderer.ts': `import {createContext} from 'react';
			export const current = createContext<{get(key: string): string} | null>(null);`,
		'observer/react-hooks.ts': `import {useContext} from 'react';
			import {current} from './renderer';
			import {valueOf} from './state';
			export function useChannel(key: string) {
				const store = useContext(current);
				return valueOf(store!.get(key));
			}`,
		'app/src/handles.ts': `import {select, selectOptions, valueOf} from 'observer/core';
			import {preload} from 'react-dom';
			import {decorate} from './decorate';
			const callback = () => {preload('/preview.png', {as: 'image'}); return 'ready';};
			export const direct = select(callback);
			export const wrapped = select(callback) as string;
			export const parenthesized = (select)(callback);
			export const alias = (direct as string);
			const choose = select;
			export const calleeAlias = choose(callback);
			const options = valueOf<{read?: () => string}>({});
			options.read = callback;
			export const mutated = selectOptions(options);
			export const escaped = selectOptions({});
			decorate(escaped);
			export const escapedIndirect = selectOptions({});
			const saved = {escapedIndirect};
			decorate(saved.escapedIndirect);
			export const escapedAlias = selectOptions({});
			const renamed = escapedAlias;
			decorate(renamed);
			const ordinary = selectOptions({});
			const plain = ordinary;
			export {plain};`,
		'app/src/decorate.ts': `import {replace} from 'observer/core';
			import {preload} from 'react-dom';
			export function decorate(key: string) {
				replace(key, () => {preload('/escaped.png', {as: 'image'}); return 'ready';});
			}`,
		'app/src/dependent.ts': `import {select, read} from 'observer/core';
			import {direct} from './handles';
			export const dependent = select(() => read(direct));`,
		'app/src/barrel.ts': "export {dependent as nested} from './dependent';",
		'app/src/snapshot-key.ts':
			"import {direct} from './handles'; export const snapshot = direct as string;",
		'app/src/directory-handle.ts': `import {select} from 'observer/core';
			import {readDirectory} from './directory';
			export const viaDirectory = select(readDirectory);`,
		'app/src/directory/package.json': JSON.stringify({ types: 'shape.d.ts', main: 'runtime.js' }),
		'app/src/directory/shape.d.ts': 'export declare function readDirectory(): string;',
		'app/src/directory/runtime.js': "export {readTsx as readDirectory} from '../resource';",
		'app/src/resource.tsx': `import {preload as hint} from 'react-dom';
			export function readTsx() {hint('/tsx-preview.png', {as: 'image'}); return 'ready';}`,
		'app/src/script-resource.js': `import {preload} from 'react-dom';
			export function readJs() {preload('/js-preview.png', {as: 'image'}); return 'ready';}`,
		'app/src/choice.ts': "export const readChoice = () => 'ready';",
		'app/src/choice.js': `import {preload} from 'react-dom';
			export function readChoice() {preload('/choice-preview.png', {as: 'image'}); return 'ready';}`,
		'app/src/tsx-handle.ts':
			"import {select} from 'observer/core'; import {readTsx} from './resource'; export const viaTsx = select(readTsx);",
		'app/src/js-handle.ts':
			"import {select} from 'observer/core'; import {readJs} from './script-resource.js'; export const viaJs = select(readJs);",
		'app/src/sibling-handle.ts':
			"import {select} from 'observer/core'; import {readChoice} from './choice.js'; export const viaSibling = select(readChoice);",
		'app/src/neutral.js': "export const readNeutral = () => 'ready';",
		'app/src/neutral.mjs': `import {preload} from 'react-dom';
			export function readNeutral() {preload('/unrelated.png', {as: 'image'}); return 'ready';}`,
		'app/src/explicit-js-key.ts':
			"import {select} from 'observer/core'; import {readNeutral} from './neutral.js'; export const explicitJs = select(readNeutral);",
		'app/src/portal-only.tsx': `import {createPortal, flushSync} from 'react-dom';
			export function readNeutral() {void createPortal; void flushSync; return 'ready';}`,
		'app/src/portal-key.ts':
			"import {select} from 'observer/core'; import {readNeutral} from './portal-only'; export const portalOnly = select(readNeutral);",
		'app/src/pure-format.tsx': 'export function format(value: string) {return value;}',
		'app/src/pure.ts': `import {select} from 'observer/core';
			import type {preload} from 'react-dom';
			import {format} from './pure-format';
			const value: Parameters<typeof preload>[0] = 'ready';
			export const pure = select(() => format(value));`,
		'app/src/root.tsx': `import {current} from '../../observer/renderer';
			import {read} from 'observer/core';
			import {Pane as Direct} from './direct';
			import {Pane as Wrapped} from './wrapped';
			import {Pane as Mutated} from './mutated';
			import {Pane as Escaped} from './escaped';
			import {Pane as EscapedIndirect} from './escapedIndirect';
			import {Pane as EscapedAlias} from './escapedAlias';
			import {Pane as ViaTsx} from './viaTsx';
			import {Pane as ViaJs} from './viaJs';
			import {Pane as ViaSibling} from './viaSibling';
			import {Pane as ViaDirectory} from './viaDirectory';
			export function Root() {
				return <current.Provider value={{get: read}}>
					<Direct/><Wrapped/><Mutated/><Escaped/><EscapedIndirect/><EscapedAlias/><ViaTsx/><ViaJs/><ViaSibling/><ViaDirectory/>
				</current.Provider>;
			}`,
		...Object.fromEntries(
			Object.entries(panes).map(([name, source]) => [
				'app/src/' + name + '.tsx',
				`import {useSnapshot} from 'observer'; import {${name}} from '${source}';
				export function Pane() {const value = useSnapshot(${name}); return <b>{String(value)}</b>;}`,
			]),
		),
	});
	const reference = await bundleRuntime(app, 'server', "export {Root} from './src/root';");
	const { renderToStaticMarkup } = await import('react-dom/server');
	const { createElement } = await import('react');
	const html = renderToStaticMarkup(createElement(reference.Root));
	for (const resource of ['preview', 'tsx-preview', 'js-preview', 'choice-preview', 'escaped']) {
		expect(html).toContain('<link rel="preload" href="/' + resource + '.png" as="image"/>');
	}
	expect(html.match(/<b>ready<\/b>/g)).toHaveLength(10);

	const names = Object.keys(panes).map((name) => 'src/' + name + '.tsx');
	const physicalApp = fs.realpathSync(app);
	const options = { strong: true, verify: true, projectTypes: true, write: false };
	const { files } = await runCodemod(
		names.map((name) => path.join(physicalApp, name)),
		{ ...options, root: physicalApp },
	);
	for (const name of names) {
		const file = files.find((entry) => entry.file === name);
		const errors = [...file.notes, ...file.diagnostics].filter(
			(entry) => entry.severity === 'error',
		);
		if (
			['src/plain.tsx', 'src/pure.tsx', 'src/explicitJs.tsx', 'src/portalOnly.tsx'].includes(name)
		) {
			expect(file.strong, name).toBe(true);
			expect(errors, name).toEqual([]);
		} else {
			expect(errors, name).toContainEqual(expect.objectContaining({ rule: 'bindings' }));
		}
	}

	const linkedApp = path.join(path.dirname(app), 'linked-app');
	fs.symlinkSync(app, linkedApp, 'dir');
	const linked = await runCodemod([path.join(linkedApp, 'src/viaDirectory.tsx')], {
		...options,
		root: linkedApp,
	});
	expect(linked.files.find((file) => file.file === 'src/viaDirectory.tsx').notes).toContainEqual(
		expect.objectContaining({ rule: 'bindings', severity: 'error' }),
	);
});

it('requires an imported application handle to come from the original shared factory', async () => {
	const { storeSources } = await import('../dist/store-inputs.js');
	const { app, plan } = fixture({
		'observer/state.ts': 'export function valueOf<T>(x: T) { return x; }',
		'app/src/handles.ts': `import {valueOf as make} from 'observer/core';
			import {useSnapshot as other} from 'observer';
			export const reading = make(1), unknown = other();
			const makeSnapshot = make;
			export const copiedFactory = makeSnapshot(1);
			let mutable = reading;
			export const snapshot = mutable, wrapped = (reading), property = {reading}.reading;
			export const opaqueAlias = unknown;
			await using disposed = make({[Symbol.asyncDispose]() {}});
			export {disposed};`,
		'app/src/attributed.ts': `import {valueOf as make} from 'observer/core' with {mode:'alternate'};
			export const direct = make(1), alias = direct;`,
	});
	const { inputFactory: factory } = storeSources(app, null, () => false);
	const planned = plan();
	const accepts = (name) => {
		const target = factory(path.join(app, 'src/pane.tsx'), './handles', name);
		return !!target && planned.isSharedExport(target.module, target.name, target.from);
	};
	expect(accepts('reading')).toBe(true);
	for (const name of [
		'copiedFactory',
		'unknown',
		'snapshot',
		'wrapped',
		'property',
		'opaqueAlias',
		'disposed',
	]) {
		expect(accepts(name), name).toBe(false);
	}
	fs.writeFileSync(path.join(app, 'src/handles.js'), 'export const reading = {};');
	expect(factory(path.join(app, 'src/pane.tsx'), './handles.js', 'reading')).toBeNull();
	expect(factory(path.join(app, 'src/pane.tsx'), './handles', 'reading')).toBeNull();
	expect(accepts('missing')).toBe(false);
	for (const name of ['direct', 'alias']) {
		expect(factory(path.join(app, 'src/pane.tsx'), './attributed', name), name).toBeNull();
	}
});

it('reports render-time reads of members supplied by the active scoped store provider', async () => {
	const pane = (
		handle,
		body,
	) => `import {useSnapshot} from 'observer'; import {useMemo} from 'react';
		import {${handle} as reading} from './handles';
		export function Pane() { const store = useSnapshot(); ${body} }`;
	const { app } = project({
		'observer/public-store.ts': "export { valueOf, key } from './state';",
		'observer/state.ts': `export function valueOf<T>(value: T) { return value; }
			export function key<T>(value: T) { return value; }`,
		'observer/renderer.ts':
			"import {createContext} from 'react'; export const current = createContext(new Map());",
		'app/src/handles.ts': `import {key} from 'observer/core';
			export const object = key({read: () => 'label'});
			export const primitive = key('stable-key');`,
		'app/src/object.tsx': pane('object', 'return <b>{String(store.get(reading))}</b>;'),
		'app/src/primitive.tsx': pane('primitive', 'return <b>{String(store.get(reading))}</b>;'),
		'app/src/memo.tsx': pane(
			'primitive',
			'const text = useMemo(() => String(store.get(reading)), []); return <b>{text}</b>;',
		),
		'app/src/inline.tsx': pane('object', 'return <b>{(() => String(store.get(reading)))()}</b>;'),
		'app/src/memo-alias.tsx': pane(
			'primitive',
			'const read = () => String(store.get(reading)); const text = useMemo(read, []); return <b>{text}</b>;',
		),
		'app/src/wrapped.tsx': pane('primitive', 'return <b>{String(((store.get))(reading))}</b>;'),
		'app/src/extracted.tsx': pane(
			'object',
			'const get = store.get; return <b>{String(get(reading))}</b>;',
		),
		'app/src/destructured.tsx': pane(
			'object',
			'const {get} = store; return <b>{String(get(reading))}</b>;',
		),
		'app/src/getter.tsx': pane('primitive', 'return <b>{String(store.size)}</b>;'),
		'app/src/computed.tsx': pane('object', 'return <b>{String(store["get"](reading))}</b>;'),
		'app/src/click.tsx': pane(
			'primitive',
			'return <button onClick={() => {store.get(reading);}}>Read</button>;',
		),
	});
	const render = [
		'object',
		'primitive',
		'memo',
		'inline',
		'memo-alias',
		'wrapped',
		'extracted',
		'destructured',
		'getter',
		'computed',
	];
	const paths = [...render, 'click'].map((name) => path.join(app, `src/${name}.tsx`));
	const result = await runCodemod(paths, {
		root: app,
		strong: true,
		verify: true,
		projectTypes: true,
	});
	for (const name of render) {
		const view = result.files.find((file) => file.file === `src/${name}.tsx`);
		expect(view.notes).toContainEqual(
			expect.objectContaining({ severity: 'error', rule: 'bindings' }),
		);
		expect(view.rules['store-hook']).toBeUndefined();
	}
	const click = result.files.find((file) => file.file === 'src/click.tsx');
	expect(click.rules['store-hook']).toBe(1);
	expect(click.notes.filter((note) => note.severity === 'error')).toEqual([]);
});

it('reports render-time provider member reads through scalar inputs and local aliases', async () => {
	const pane = (body) => `import {useSnapshot} from 'observer'; import {useEffect} from 'react';
		export function Pane({id}: {id: string}) { ${body} }`;
	const views = {
		Direct: 'const store = useSnapshot(id); return <b>{store.label}</b>;',
		Destructure: 'const {label} = useSnapshot(id); return <b>{label}</b>;',
		Literal: "const store = useSnapshot('fixed'); return <b>{store.label}</b>;",
		Alias: 'const store = useSnapshot(id); const alias = store; return <b>{alias.label}</b>;',
		Branch:
			"const store = useSnapshot('fixed'); const alias = id ? store : {label: 'empty'}; return <b>{alias.label}</b>;",
		Nullish:
			"const store = useSnapshot('fixed'); const alias = store ?? {label: 'empty'}; return <b>{alias.label}</b>;",
		ShortCircuit:
			"const store = useSnapshot('fixed'); const alias = id && store; return <b>{alias && alias.label}</b>;",
		Shorthand:
			'const store = useSnapshot(id); const holder = {store}; return <b>{holder.store.label}</b>;',

		Effect:
			'const store = useSnapshot(id); useEffect(() => {void store.label;}, [store]); return <b>effect</b>;',
		Cleanup:
			'const store = useSnapshot(id); useEffect(() => (() => {void store.label;}), [store]); return <b>cleanup</b>;',
		Identity: "const store = useSnapshot(id); return <b>{store ? 'exists' : 'missing'}</b>;",
		Presence:
			"const store = useSnapshot(id); const alias = store ? {label:'exists'} : {label:'missing'}; return <b>{alias.label}</b>;",
	};
	const { app } = project({
		'observer/state.ts': `export function valueOf(owner: {label: string}, id: string) {
			return id === '' ? {label: 'empty'} : owner;
		}`,
		'observer/renderer.ts':
			"import {createContext} from 'react'; export const current = createContext({label: 'base'});",
		'observer/react-hooks.ts': original
			.replace('useChannel()', 'useChannel(id: string)')
			.replace('valueOf(readContext(current))', 'valueOf(readContext(current), id)'),
		...Object.fromEntries(
			Object.entries(views).map(([name, body]) => [`app/src/${name}.tsx`, pane(body)]),
		),
	});
	const { files } = await runCodemod(
		Object.keys(views).map((name) => path.join(app, `src/${name}.tsx`)),
		{
			root: app,
			strong: true,
			verify: true,
			projectTypes: true,
			write: false,
		},
	);
	for (const name of [
		'Direct',
		'Destructure',
		'Literal',
		'Alias',
		'Branch',
		'Nullish',
		'ShortCircuit',
		'Shorthand',
	]) {
		const view = files.find((file) => file.file === `src/${name}.tsx`);
		expect(view.notes, name).toContainEqual(
			expect.objectContaining({ rule: 'bindings', severity: 'error' }),
		);
	}
	for (const name of ['Effect', 'Cleanup', 'Identity', 'Presence']) {
		const view = files.find((file) => file.file === `src/${name}.tsx`);
		expect(view.strong, name).toBe(true);
		expect(
			view.notes.filter((note) => note.severity === 'error'),
			name,
		).toEqual([]);
	}
});

it('retains the bindings diagnostic for wrapped keys that can dispatch into React', async () => {
	const pane = (name) => `import {useSnapshot} from 'observer'; import {${name}} from './handles';
		export function Pane() {const store=useSnapshot();return <b>{String(store.get(${name}))}</b>;}`;
	const typedKeys = [
		'parenthesized',
		'asserted',
		'present',
		'satisfied',
		'wrappedCallee',
		'instantiatedCallee',
		'directObject',
	];
	const { app } = project({
		'observer/public-store.ts': "export {valueOf,key} from './state';",
		'observer/state.ts': `export function valueOf(x){return x;}
			export function key(value){if (value === 'primitive') return value;
				return value === 'fixed' ? Object.freeze({value}) : {read:()=>value};}`,
		'app/src/handles.ts': `import {key} from 'observer/core'; import {useState} from 'react';
			function wrap(value){return key(value);}
			function wrapKey<T extends string>(value: T): string {return key(value) as string;}
			export const changed=wrap('changed'), fixed=wrap('fixed'), callback=wrap(()=>useState('callback')[0]);
			export const primitive = wrapKey('primitive');
			export const parenthesized = (wrapKey('primitive'));
			export const asserted = wrapKey('primitive') as string;
			export const present = wrapKey('primitive')!;
			export const satisfied = wrapKey('primitive') satisfies string;
			export const wrappedCallee = (wrapKey)('primitive');
			export const instantiatedCallee = (wrapKey<string>)('primitive');
			export const directObject = (key('fixed') as object);`,
		'app/src/change.ts': `import {changed} from './handles'; import {useState} from 'react';
			changed.read=()=>useState('changed')[0];`,
		'app/src/public.ts': "export {fixed,primitive} from './handles';",
		'app/src/attributed-public.ts':
			"export {primitive as viaAttributes} from './handles' with {mode:'custom'};",
		'app/src/changed.tsx': pane('changed'),
		'app/src/fixed.tsx': pane('fixed'),
		'app/src/callback.tsx': pane('callback'),
		'app/src/primitive.tsx': pane('primitive').replace("'./handles'", "'./public'"),
		...Object.fromEntries(typedKeys.map((name) => ['app/src/' + name + '.tsx', pane(name)])),
		'app/src/attributed.tsx': pane('primitive').replace(
			"'./handles';",
			"'./handles' with {mode:'custom'};",
		),
		'app/src/attributedReexport.tsx': pane('viaAttributes').replace(
			"'./handles'",
			"'./attributed-public'",
		),
		'app/src/alias.tsx': `import {useSnapshot} from 'observer';
			import {changed as queued,changed as direct} from './handles'; import './change';
			export function Pane(){const store=useSnapshot();const later=async()=>{await 0;store.get(queued);};
				return <b onClick={later}>{String(direct.read())}</b>;}`,
		'app/src/awaited.tsx': `import {useSnapshot} from 'observer'; import {fixed} from './public';
			export function Pane({wait}) {const store=useSnapshot();
				return <button onClick={async()=>{await wait;store.get(fixed);}}>Read</button>;}`,
		'app/src/root.tsx': `import './change'; import {fixed,callback,primitive} from './handles'; import {useState} from 'react';
			import {current} from '../../observer/renderer'; import {Pane as Changed} from './changed';
			import {Pane as Fixed} from './fixed'; import {Pane as Callback} from './callback'; import {Pane as Alias} from './alias';
			import {Pane as Primitive} from './primitive';
			const registry=new Map([[fixed,()=>useState('registered')[0]],[callback, callback.read()],[primitive,()=>useState('primitive')[0]]]);
			const store={get(key){return (registry.get(key) ?? key.read)();}};
			export function Root(){return <current.Provider value={store}><Changed/><Fixed/><Callback/><Alias/><Primitive/></current.Provider>;}`,
	});
	const reference = await bundleRuntime(
		app,
		'server',
		"export {Root} from './src/root'; export {fixed} from './src/handles';",
	);
	const { renderToStaticMarkup } = await import('react-dom/server');
	const { createElement } = await import('react');
	expect(Object.isFrozen(reference.fixed)).toBe(true);
	expect(renderToStaticMarkup(createElement(reference.Root))).toBe(
		'<b>changed</b><b>registered</b><b>callback</b><b>changed</b><b>primitive</b>',
	);
	const files = [
		'changed',
		'fixed',
		'callback',
		'alias',
		'primitive',
		'awaited',
		'attributed',
		'attributedReexport',
		...typedKeys,
	].map((name) => 'src/' + name + '.tsx');
	const result = await runCodemod(
		files.map((file) => path.join(app, file)),
		{ root: app, strong: true, verify: true, projectTypes: true },
	);
	for (const name of files) {
		const file = result.files.find((f) => f.file === name);
		expect(file.notes, name).toContainEqual(
			expect.objectContaining({
				rule: 'bindings',
				severity: 'error',
				message: expect.stringContaining('observer'),
			}),
		);
		expect(file.rules['store-hook'], name).toBeUndefined();
	}
});

it('defers wrapped handles whose factory or original module can change', async () => {
	const valid = 'function wrap(x) { return make(x); }';
	const cases = {
		reassigned: valid + ' function replace() { wrap = other; }',
		destructuring: valid + ' ({ wrap } = other);',
		loop: valid + ' for (wrap of choices) {}',
		shadow: 'function wrap({make}) { return make(); }',
		async: 'async function wrap(x) { return make(x); }',
		generator: 'function* wrap(x) { return make(x); }',
		alternative: 'function wrap(x) { return x ? make(x) : other(x); }',
		cycle: 'function wrap(x) { return inner(x); } function inner(x) { return wrap(x); }',
		evaluated: valid + ' function change(source) { eval(source); }',
		opaque: 'function wrap(x) { return other(x); }',
		'attributed-factory': valid,
		'attributed-handle': valid,
		'attributed-hook-input': valid,
		selected: valid,
	};
	const modules = {
		'observer/state.ts': 'export function valueOf(value: unknown) { return {value}; }',
	};
	const inputs = [];
	for (const [name, body] of Object.entries(cases)) {
		const handle = 'src/' + name + '-handle.ts';
		const view = 'src/' + name + '.tsx';
		const attributes = ' with { mode: "custom" }';
		const factoryAttributes = name === 'attributed-factory' ? attributes : '';
		const handleAttributes =
			name === 'attributed-handle' || name === 'attributed-hook-input' ? attributes : '';
		const read =
			name === 'attributed-hook-input'
				? "return <b>{useSnapshot(reading) ? 'yes' : 'no'}</b>;"
				: 'const store = useSnapshot(); return <b>{String(store.get(reading))}</b>;';
		modules['app/' + handle] = `import {valueOf as make} from 'observer/core'${factoryAttributes};
			${body} export const reading = wrap(1);`;
		modules['app/' + view] = `import {useSnapshot} from 'observer';
			import {reading} from './${name}-handle'${handleAttributes};
			export function Pane() { ${read} }`;
		inputs.push(view);
		if (name === 'selected') inputs.push(handle);
	}
	const { app } = project(modules);
	const result = await runCodemod(
		inputs.map((file) => path.join(app, file)),
		{ root: app, strong: true, verify: true },
	);
	const views = result.files.filter((f) => f.file.endsWith('.tsx'));
	expect(views).toHaveLength(Object.keys(cases).length);
	for (const file of views) {
		expect(file.notes, file.file).toContainEqual(
			expect.objectContaining({ severity: 'error', message: expect.stringContaining('observer') }),
		);
		expect(file.rules['store-hook'], file.file).toBeUndefined();
	}
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
	expect(notes.map((n) => n.rule)).toEqual(['svg-issuer', 'svg-issuer']);
	expect(notes.map((n) => n.message)).toEqual([
		expect.stringMatching(/<Button> renders its children/),
		expect.stringMatching(/<Row> renders its icon prop/),
	]);
	expect(files.filter((f) => f.output.endsWith('.svg.octane.ts')).map((f) => f.output)).toEqual([
		'src/accepted.svg.octane.ts',
	]);
});
