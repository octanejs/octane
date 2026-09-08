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
async function bundleApp(source: string) {
	const { code } = compile(source, resolve(TESTS, 'form-action-bundle.tsrx'), {
		mode: 'client',
		dev: false,
		hmr: false,
	});
	const result = await build({
		stdin: {
			contents: `${code}\nexport { __createVoidRoot as createRoot } from 'octane';`,
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

async function load(text: string) {
	return (await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`)) as {
		App: any;
		createRoot: typeof import('../src/index.js').createRoot;
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
