// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { createOctaneCompiler } from '../src/compiler/bundler.js';

function transformConsumer(
	directory: string,
	view: string,
	entry: string,
	dev = false,
	extension = 'ts',
	compilerOptions: Record<string, unknown> = {},
) {
	const compiler = createOctaneCompiler({ root: directory, dev, hmr: false, ...compilerOptions });
	const component = compiler.transform(view, join(directory, 'View.tsrx'), {
		collectVoidComponentExports: true,
	});
	if (component === null) throw new Error('Component did not compile');
	const voidExports: readonly string[] =
		'voidComponentExports' in component ? (component.voidComponentExports ?? []) : [];
	const transformed = compiler.transform(entry, join(directory, `entry.${extension}`), {
		isVoidComponentImport: (request: string, imported: string) =>
			request === './View.tsrx' && voidExports.includes(imported),
	});
	return { component, code: transformed?.code ?? entry };
}

function specializedEntry(view: string, entry: string, extension = 'ts') {
	const directory = mkdtempSync(join(tmpdir(), 'octane-local-root-'));
	try {
		return transformConsumer(directory, view, entry, false, extension).code;
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

async function runConsumer(
	view: string,
	entry: string,
	dev = false,
	extension = 'ts',
	compilerOptions: Record<string, unknown> = {},
) {
	const directory = mkdtempSync(join(tmpdir(), 'octane-local-root-'));
	const window = new Window({
		url: 'https://octane.test/',
		settings: { enableJavaScriptEvaluation: true },
	});
	window.document.body.innerHTML = '<div id="host"></div>';
	try {
		const { component, code } = transformConsumer(
			directory,
			view,
			entry,
			dev,
			extension,
			compilerOptions,
		);
		const result = await build({
			stdin: {
				contents: code,
				resolveDir: resolve(import.meta.dirname, '..'),
				loader: extension === 'tsx' ? 'tsx' : 'ts',
			},
			bundle: true,
			write: false,
			format: 'iife',
			globalName: 'consumer',
			platform: 'browser',
			target: 'esnext',
			logLevel: 'silent',
			define: {
				'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
				__OCTANE_PROFILE_ENABLED__: 'false',
			},
			plugins: [
				{
					name: 'compiled-consumer-view',
					setup(plugin) {
						plugin.onResolve({ filter: /^\.\/View\.tsrx$/ }, () => ({
							path: 'view',
							namespace: 'consumer-view',
						}));
						plugin.onLoad({ filter: /.*/, namespace: 'consumer-view' }, () => ({
							contents: component.code,
							loader: 'js',
							resolveDir: resolve(import.meta.dirname, '..'),
						}));
					},
				},
			],
		});
		window.eval(result.outputFiles[0].text);
		return JSON.parse(JSON.stringify(await (window as any).consumer.run()));
	} finally {
		window.close();
		rmSync(directory, { recursive: true, force: true });
	}
}

const IMPORTS = "import {createRoot, flushSync} from 'octane'; import View from './View.tsrx';\n";
const VIEW =
	'export default function View(props) @{ <main>{props.label as string}<input /></main> }';

describe('production local roots across compiled component imports', () => {
	it.each(['ts', 'tsx'])(
		'preserves props, retained input state and cleanup from a %s entry',
		async (extension) => {
			const view = `import {useState, useLayoutEffect} from 'octane';
let cleanups = 0;
export default function View(props) @{
 const [count, update] = useState(0);
 useLayoutEffect(() => () => { cleanups++; }, []);
 <main><button onClick={() => update(count + 1)}>{props.label as string}:{String(count) as string}</button><input /></main>
}
export function cleanupCount() { return cleanups; }`;
			const entry = `${IMPORTS}
import {cleanupCount} from './View.tsrx';
export async function run() {
 const host = document.querySelector('#host');
 const root = createRoot(host);
 root.render(View, {label:'first'});
 const button = host.querySelector('button'), input = host.querySelector('input');
 input.value = 'typed'; button.click(); await Promise.resolve();
 const clicked = button.textContent;
 root.render(View, {label:'second'}); await Promise.resolve();
 const updated = button.textContent;
 const retained = input === host.querySelector('input') && input.value === 'typed';
 root.unmount();
 return {clicked, updated, retained, cleaned:host.childNodes.length === 0, cleanups:cleanupCount()};
}`;
			for (const dev of [false, true]) {
				expect(await runConsumer(view, entry, dev, extension)).toEqual({
					clicked: 'first:1',
					updated: 'second:1',
					retained: true,
					cleaned: true,
					cleanups: 1,
				});
			}
		},
	);

	it('preserves forwarded signal props when the engine loads after the first mount', async () => {
		const view =
			'export default function View(props) @{ <main><span>{props.value as string}</span><input value={props.value} /><textarea /></main> }';
		const entry = `${IMPORTS}
export async function run() {
 const host=document.querySelector('#host'); const root=createRoot(host);
 root.render(View, {value:'ordinary'});
 const span=host.querySelector('span'), input=host.querySelector('input'), spare=host.querySelector('textarea');
 spare.value='typed';
 const {createScope}=await import('octane/signals');
 const scope=createScope({scopeKey:'late-local-root'}), value=scope.signal$('value','first');
 root.render(View,{value}); await Promise.resolve(); const before=span.textContent;
 flushSync(()=>value.set('second')); const after=span.textContent;
 const inputValue=input.value, retained=span===host.querySelector('span') && input===host.querySelector('input') && spare.value==='typed';
 root.unmount(); value.set('disposed'); scope.dispose(); return {before,after,inputValue,retained,cleaned:host.childNodes.length===0};
}`;
		// The untyped view renders handles from a lazily loaded engine, so it opts
		// in through the compiler option.
		for (const dev of [false, true]) {
			expect(await runConsumer(view, entry, dev, 'ts', { opaqueSignalHandles: true })).toEqual({
				before: 'first',
				after: 'second',
				inputValue: 'second',
				retained: true,
				cleaned: true,
			});
		}
	});

	describe.each(['ts', 'tsx'])(
		'roots rendered from retained callbacks in a %s entry',
		(extension) => {
			const view = `import {useState, useLayoutEffect} from 'octane';
let cleanups = 0;
export default function View(props) @{
 const [count, update] = useState(0);
 useLayoutEffect(() => () => { cleanups++; }, []);
 <main><button onClick={() => update(count + 1)}>{props.label + ':' + count as string}</button><input defaultValue="initial" /></main>
}
export function cleanupCount() { return cleanups; }`;

			it.each(['createRoot', 'hydrateRoot'])(
				'keeps state, drafts and cleanup for independent %s controllers',
				async (factory) => {
					const hydrate = factory === 'hydrateRoot';
					const entry = `import {${factory}, flushSync} from 'octane'; import View, {cleanupCount} from './View.tsrx';
function attach(host, label) {
 const root = ${hydrate ? 'hydrateRoot(host, View, {label});' : 'createRoot(host); root.render(View, {label});'}
 return { replace(label) { flushSync(() => root.render(View, {label})); }, dispose() { root.unmount(); } };
}
export async function run() {
 const host = document.querySelector('#host'), other = document.body.appendChild(document.createElement('div'));
 ${hydrate ? `host.innerHTML = '<main><button>a:0</button><input value="initial"></main>'; other.innerHTML = '<main><button>b:0</button><input value="initial"></main>';` : ''}
 const server = host.querySelector('button'), a = attach(host, 'a'), b = attach(other, 'b');
 const button = host.querySelector('button'), input = host.querySelector('input');
 input.value = 'typed'; button.click(); await Promise.resolve();
 a.replace('next');
 const updated = {adopted: server === button, text: host.textContent, other: other.textContent,
  same: button === host.querySelector('button') && input === host.querySelector('input') && input.value === 'typed'};
 a.dispose(); const disposed = {cleanups: cleanupCount(), cleaned: host.childNodes.length === 0, other: other.textContent};
 b.replace('later'); const later = other.textContent; b.dispose();
 return {updated, disposed, later, cleanups: cleanupCount(), cleaned: other.childNodes.length === 0};
}`;
					expect(specializedEntry(view, entry, extension)).toContain(
						hydrate ? '__hydrateVoidRoot' : '__createVoidRoot',
					);
					for (const dev of [false, true]) {
						expect(await runConsumer(view, entry, dev, extension)).toEqual({
							updated: { adopted: hydrate, text: 'next:1', other: 'b:0', same: true },
							disposed: { cleanups: 1, cleaned: true, other: 'b:0' },
							later: 'later:0',
							cleanups: 2,
							cleaned: true,
						});
					}
				},
			);

			it.each([
				['a parameter', 'replace(View) { root.render(View); }', "c.replace(() => 'ordinary')"],
				[
					'a block const',
					"replace() { const View = () => 'ordinary'; root.render(View); }",
					'c.replace()',
				],
			])(
				'renders returned output when a callback target is shadowed by %s',
				async (_label, method, call) => {
					const entry = `${IMPORTS}
function attach(host) { const root = createRoot(host); root.render(View, {label:'first'}); return { ${method}, dispose() { root.unmount(); } }; }
export function run() { const host = document.querySelector('#host'), c = attach(host); flushSync(() => ${call});
 const text = host.textContent; c.dispose(); return {text, cleaned: host.childNodes.length === 0}; }`;
					for (const dev of [false, true]) {
						expect(await runConsumer(VIEW, entry, dev, extension)).toEqual({
							text: 'ordinary',
							cleaned: true,
						});
					}
				},
			);
		},
	);

	it('keeps escaped roots reusable for renderable values', async () => {
		const entry = `${IMPORTS}
function mount(host) { const root = createRoot(host); root.render(View, {label:'first'}); return root; }
export function run() { const host=document.querySelector('#host'); const root=mount(host);
 root.render('returned'); const text=host.textContent; root.unmount(); return {text, cleaned:host.childNodes.length === 0}; }`;
		expect(await runConsumer(VIEW, entry)).toEqual({ text: 'returned', cleaned: true });
	});

	it.each([
		`namespace N { export const root=createRoot(document.querySelector('#host')); root.render(View, {label:'first'}); }
export function run() { flushSync(()=>N.root.render('ordinary')); const host=document.querySelector('#host');
 const text=host.textContent; N.root.unmount(); return {text,cleaned:host.childNodes.length===0}; }`,
		`namespace N { export const root=createRoot(document.querySelector('#host')); root.render(View, {label:'first'}); }
namespace N { export function replace() { flushSync(()=>N.root.render('ordinary')); } }
export function run() { N.replace(); const host=document.querySelector('#host');
 const text=host.textContent; N.root.unmount(); return {text,cleaned:host.childNodes.length===0}; }`,
	])('keeps exported namespace roots reusable for ordinary renderables', async (body) => {
		for (const dev of [false, true]) {
			expect(await runConsumer(VIEW, IMPORTS + body, dev)).toEqual({
				text: 'ordinary',
				cleaned: true,
			});
		}
	});

	it('keeps a local root generic when a later render target is unknown', async () => {
		const entry = `${IMPORTS}
function Plain() { return 'plain'; }
export function run() { const host=document.querySelector('#host'); const root=createRoot(host);
 root.render(View, {label:'first'}); root.render(Plain); const text=host.textContent; root.unmount(); return {text}; }`;
		expect(await runConsumer(VIEW, entry)).toEqual({ text: 'plain' });
	});

	it('uses the actual lexical factory and component bindings', async () => {
		const entry = `${IMPORTS}
function make(createRoot, View) { const host=document.querySelector('#host'); const root=createRoot(host);
 root.render(View); const text=host.textContent; root.unmount(); return text; }
export function run() { return {factory:make(host=>({render(){host.textContent='custom';},unmount(){host.textContent='';}}), View),
 component:make(createRoot, ()=>'shadow')}; }`;
		expect(await runConsumer(VIEW, entry)).toEqual({ factory: 'custom', component: 'shadow' });
	});

	it('keeps direct-eval root uses on the renderable path', async () => {
		const entry = `${IMPORTS}
export function run() { const host=document.querySelector('#host'); const root=createRoot(host);
 root.render(View, {label:'first'}); eval("root.render('evaluated')"); const text=host.textContent; root.unmount(); return {text}; }`;
		expect(await runConsumer(VIEW, entry)).toEqual({ text: 'evaluated' });
	});

	it.each([
		'App = () => "replacement";',
		'({App} = {App:() => "replacement"});',
		'eval("App = () => \'replacement\'");',
	])('preserves a live exported component after an authored binding write: %s', async (write) => {
		const view = `const initial = App;
export function App() @{ <main>first</main> }
export function replace() { ${write} }`;
		const entry = `import {createRoot} from 'octane'; import {App,replace} from './View.tsrx';
export function run() { const host=document.querySelector('#host'); const root=createRoot(host);
 root.render(App); const before=host.textContent; replace(); root.render(App);
 const after=host.textContent; root.unmount(); return {before,after}; }`;
		for (const dev of [false, true]) {
			expect(await runConsumer(view, entry, dev)).toEqual({
				before: 'first',
				after: 'replacement',
			});
		}
	});

	it('renders the current live export through a disposable root', async () => {
		const view = `const initial = App;
export function App() @{ <main>first</main> }
export function replace() { App = () => 'replacement'; }`;
		const entry = `import {createRoot} from 'octane'; import {App,replace} from './View.tsrx';
replace(); createRoot(document.querySelector('#host')).render(App);
export function run() { return {text:document.querySelector('#host').textContent}; }`;
		expect(await runConsumer(view, entry)).toEqual({ text: 'replacement' });
	});
});
