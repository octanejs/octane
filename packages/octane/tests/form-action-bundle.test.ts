// @vitest-environment node

import { resolve } from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';

const TESTS = import.meta.dirname;
const DOM_GLOBALS = [
	'window',
	'document',
	'navigator',
	'Node',
	'Element',
	'HTMLElement',
	'SVGElement',
	'Text',
	'Comment',
	'DocumentFragment',
	'Event',
	'EventTarget',
	'MutationObserver',
	'HTMLInputElement',
	'HTMLSelectElement',
	'HTMLTextAreaElement',
	'HTMLFormElement',
	'FormData',
	'getComputedStyle',
	'requestAnimationFrame',
	'cancelAnimationFrame',
];

// esbuild's JS API cannot run inside Vitest's jsdom realm, so the production
// bundle executes against an explicitly installed DOM instead.
async function withDom<T>(run: (window: JSDOM['window']) => Promise<T>): Promise<T> {
	const { window } = new JSDOM('<!doctype html><html><body></body></html>', {
		url: 'http://localhost/',
	});
	const previous = new Map<string, PropertyDescriptor | undefined>();
	for (const key of DOM_GLOBALS) {
		previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
		const value = key === 'window' ? window : (window as any)[key];
		if (value !== undefined)
			Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
	}
	try {
		return await run(window);
	} finally {
		for (const [key, descriptor] of previous) {
			if (descriptor === undefined) delete (globalThis as any)[key];
			else Object.defineProperty(globalThis, key, descriptor);
		}
		window.close();
	}
}

// Bundle a compiled component together with the production runtime, keeping
// declaration names so reachability can be read from the output. The
// compiler-proven void root mirrors the specialized starter entries; the
// generic createRoot output handler retains the descriptor renderer, whose
// spread and host-prop paths own function form actions by design.
async function bundleApp(source: string, extraEntry = '') {
	const { code } = compile(source, resolve(TESTS, 'form-action-bundle.tsrx'), {
		mode: 'client',
		dev: false,
		hmr: false,
	});
	const result = await build({
		stdin: {
			contents: `${code}\nexport { __createVoidRoot as createRoot } from 'octane';\n${extraEntry}`,
			loader: 'js',
			resolveDir: resolve(TESTS, '..'),
			sourcefile: 'form-action-bundle-entry.js',
		},
		bundle: true,
		define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		format: 'esm',
		logLevel: 'silent',
		minifyWhitespace: true,
		minifySyntax: true,
		platform: 'browser',
		target: 'esnext',
		treeShaking: true,
		write: false,
	});
	return result.outputFiles[0].text;
}

function submit(window: JSDOM['window'], form: HTMLFormElement) {
	const event = new window.Event('submit', { bubbles: true, cancelable: true });
	form.dispatchEvent(event);
	return event.defaultPrevented;
}

async function load(text: string) {
	return (await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`)) as {
		App: any;
		createRoot: typeof import('../src/index.js').createRoot;
		flushSync: typeof import('../src/index.js').flushSync;
	};
}

describe('production form-action reachability', () => {
	it('keeps the submit interception and transition graph out of event-only bundles', async () => {
		const text = await bundleApp(
			`export function App(props: { onClick: () => void }) @{ <button onClick={props.onClick}>go</button> }`,
		);
		expect(text).not.toMatch(/function handleFormSubmit\(/);
		expect(text).not.toMatch(/function startTransition\(/);

		await withDom(async (window) => {
			const { App, createRoot } = await load(text);
			let clicks = 0;
			const container = window.document.createElement('div');
			window.document.body.append(container);
			const root = createRoot(container);
			try {
				root.render(App, { onClick: () => clicks++ });
				container.querySelector('button')!.click();
				expect(clicks).toBe(1);
			} finally {
				root.unmount();
			}
		});
	});

	it('retains submit interception for authored function form actions', async () => {
		const text = await bundleApp(
			`export function App(props: { action: (data: FormData) => void }) @{ <form action={props.action}><button>go</button></form> }`,
		);
		expect(text).toMatch(/function handleFormSubmit\(/);

		await withDom(async (window) => {
			const { App, createRoot } = await load(text);
			const calls: boolean[] = [];
			const container = window.document.createElement('div');
			window.document.body.append(container);
			const root = createRoot(container);
			try {
				root.render(App, {
					action: (data: FormData) => calls.push(data instanceof window.FormData),
				});
				const event = new window.Event('submit', { bubbles: true, cancelable: true });
				container.querySelector('form')!.dispatchEvent(event);
				expect(event.defaultPrevented).toBe(true);
				expect(calls).toEqual([true]);
			} finally {
				root.unmount();
			}
		});
	});
});

// The generic child renderer (any renderable hole) renders host and Fragment
// descriptors. Only an element factory that can carry a function form action or
// a Fragment ref installs those paths: compiled JSX whose props name them or
// spread, and the public createElement/cloneElement factories.
const FRAGMENT_INSTANCE = /\bFragmentInstance\s*=\s*class\b|\bclass FragmentInstance\b/;

describe('production descriptor capability reachability', () => {
	it('keeps form actions and Fragment refs out of a renderable hole whose descriptors cannot carry them', async () => {
		const text = await bundleApp(
			`export function App(props: { label: unknown }) @{
				const item = <li class="item">{'x'}</li>;
				<ul>{props.label}{item}</ul>
			}`,
		);
		expect(text).toMatch(/function childSlot\(/);
		expect(text).not.toMatch(/function handleFormSubmit\(/);
		expect(text).not.toMatch(/function startTransition\(/);
		expect(text).not.toMatch(FRAGMENT_INSTANCE);

		await withDom(async (window) => {
			const { App, createRoot } = await load(text);
			const container = window.document.createElement('div');
			window.document.body.append(container);
			const root = createRoot(container);
			try {
				root.render(App, { label: 'text' });
				expect(container.textContent).toBe('textx');
				expect(container.querySelector('li.item')?.textContent).toBe('x');
			} finally {
				root.unmount();
			}
		});
	});

	it('installs submit interception for a function action on a value-position descriptor', async () => {
		const text = await bundleApp(
			`export function App(props: { action: (data: FormData) => void }) @{
				const form = <form action={props.action}><button>go</button></form>;
				<div>{form}</div>
			}`,
		);
		expect(text).toMatch(/function handleFormSubmit\(/);
		expect(text).not.toMatch(FRAGMENT_INSTANCE);

		await withDom(async (window) => {
			const { App, createRoot } = await load(text);
			const calls: boolean[] = [];
			const container = window.document.createElement('div');
			window.document.body.append(container);
			const root = createRoot(container);
			try {
				root.render(App, {
					action: (data: FormData) => calls.push(data instanceof window.FormData),
				});
				expect(submit(window, container.querySelector('form')!)).toBe(true);
				expect(calls).toEqual([true]);
			} finally {
				root.unmount();
			}
		});
	});

	it('installs submit interception for a spread on a value-position descriptor', async () => {
		const text = await bundleApp(
			`export function App(props: { formProps: Record<string, unknown> }) @{
				const form = <form {...props.formProps}><button>go</button></form>;
				<div>{form}</div>
			}`,
		);
		expect(text).toMatch(/function handleFormSubmit\(/);

		await withDom(async (window) => {
			const { App, createRoot } = await load(text);
			const calls: number[] = [];
			const container = window.document.createElement('div');
			window.document.body.append(container);
			const root = createRoot(container);
			try {
				root.render(App, { formProps: { action: () => calls.push(1) } });
				expect(submit(window, container.querySelector('form')!)).toBe(true);
				expect(calls).toEqual([1]);
			} finally {
				root.unmount();
			}
		});
	});

	it('installs every descriptor capability through the public createElement', async () => {
		const text = await bundleApp(
			`import { createElement, Fragment } from 'octane';
			export function App(props: { action: () => void; fragmentRef: { current: unknown } }) @{
				const form = createElement('form', { action: props.action }, createElement('button', null, 'go'));
				const group = createElement(Fragment, { ref: props.fragmentRef }, createElement('span', null, 'a'));
				<div>{form}{group}</div>
			}`,
			"export { flushSync } from 'octane';",
		);
		expect(text).toMatch(/function handleFormSubmit\(/);
		expect(text).toMatch(FRAGMENT_INSTANCE);

		await withDom(async (window) => {
			const { App, createRoot, flushSync } = await load(text);
			const calls: number[] = [];
			const fragmentRef = { current: null as any };
			const container = window.document.createElement('div');
			window.document.body.append(container);
			const root = createRoot(container);
			try {
				flushSync(() => root.render(App, { action: () => calls.push(1), fragmentRef }));
				expect(submit(window, container.querySelector('form')!)).toBe(true);
				expect(calls).toEqual([1]);
				expect(typeof fragmentRef.current?.getClientRects).toBe('function');
			} finally {
				root.unmount();
			}
		});
	});

	it('installs Fragment refs for a ref on a value-position Fragment descriptor', async () => {
		const text = await bundleApp(
			`import { Fragment } from 'octane';
			export function App(props: { fragmentRef: { current: unknown } }) @{
				const group = <Fragment ref={props.fragmentRef}><span>{'a'}</span></Fragment>;
				<div>{group}</div>
			}`,
			"export { flushSync } from 'octane';",
		);
		expect(text).toMatch(FRAGMENT_INSTANCE);
		expect(text).not.toMatch(/function handleFormSubmit\(/);

		await withDom(async (window) => {
			const { App, createRoot, flushSync } = await load(text);
			const fragmentRef = { current: null as any };
			const container = window.document.createElement('div');
			window.document.body.append(container);
			const root = createRoot(container);
			try {
				flushSync(() => root.render(App, { fragmentRef }));
				expect(container.querySelector('div > span')?.textContent).toBe('a');
				expect(typeof fragmentRef.current?.getClientRects).toBe('function');
			} finally {
				root.unmount();
			}
		});
	});

	it('keeps the capabilities out when spread props reach a module component', async () => {
		const text = await bundleApp(
			`function Label(props: { text: string; title?: string }) @{
				<span title={props.title}>{props.text}</span>
			}
			export function App(props: { rest: { text: string; title?: string } }) @{
				const label = <Label {...props.rest} />;
				<div>{label}</div>
			}`,
		);
		expect(text).toMatch(/function childSlot\(/);
		expect(text).not.toMatch(/function handleFormSubmit\(/);
		expect(text).not.toMatch(FRAGMENT_INSTANCE);

		await withDom(async (window) => {
			const { App, createRoot } = await load(text);
			const container = window.document.createElement('div');
			window.document.body.append(container);
			const root = createRoot(container);
			try {
				root.render(App, { rest: { text: 'hi', title: 't' } });
				expect(container.querySelector('span[title="t"]')?.textContent).toBe('hi');
			} finally {
				root.unmount();
			}
		});
	});

	it('installs submit interception when a parameter shadows a module component name', async () => {
		const text = await bundleApp(
			`function Form(props: { children?: unknown }) @{
				<section>{props.children}</section>
			}
			export function App({ Form, action }: { Form: any; action: () => void }) @{
				const form = <Form action={action}><button>go</button></Form>;
				<div>{form}</div>
			}`,
		);
		expect(text).toMatch(/function handleFormSubmit\(/);

		await withDom(async (window) => {
			const { App, createRoot } = await load(text);
			const calls: number[] = [];
			const container = window.document.createElement('div');
			window.document.body.append(container);
			const root = createRoot(container);
			try {
				root.render(App, { Form: 'form', action: () => calls.push(1) });
				expect(submit(window, container.querySelector('form')!)).toBe(true);
				expect(calls).toEqual([1]);
			} finally {
				root.unmount();
			}
		});
	});

	it('installs submit interception when a parameter shadows the Fragment import', async () => {
		const text = await bundleApp(
			`import { Fragment } from 'octane';
			export function Group(props: { children?: unknown }) @{
				const group = <Fragment>{props.children}</Fragment>;
				<div>{group}</div>
			}
			export function App({ Fragment, action }: { Fragment: any; action: () => void }) @{
				const form = <Fragment action={action}><button>go</button></Fragment>;
				<div>{form}</div>
			}`,
		);
		expect(text).toMatch(/function handleFormSubmit\(/);

		await withDom(async (window) => {
			const { App, createRoot } = await load(text);
			const calls: number[] = [];
			const container = window.document.createElement('div');
			window.document.body.append(container);
			const root = createRoot(container);
			try {
				root.render(App, { Fragment: 'form', action: () => calls.push(1) });
				expect(submit(window, container.querySelector('form')!)).toBe(true);
				expect(calls).toEqual([1]);
			} finally {
				root.unmount();
			}
		});
	});
});
