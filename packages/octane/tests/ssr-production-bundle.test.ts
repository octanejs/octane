// @vitest-environment node

import { resolve } from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { createOctaneCompiler } from '../src/compiler/bundler.js';
import { activateStreamedMarkup, resetStreamRuntimeGlobals } from './_server-stream.js';

const packageRoot = resolve(import.meta.dirname, '..');

async function productionServerModule<T extends Record<string, unknown>>(
	entry: string,
	componentSource?: string,
): Promise<T> {
	const compiledComponent =
		componentSource === undefined
			? undefined
			: createOctaneCompiler({ root: packageRoot, hmr: false, dev: false }).transform(
					componentSource,
					resolve(packageRoot, 'ProductionServerPage.tsrx'),
					{ environment: 'server' },
				)?.code;

	const result = await build({
		stdin: {
			contents: entry,
			loader: 'js',
			resolveDir: packageRoot,
			sourcefile: 'production-server-entry.js',
		},
		bundle: true,
		define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		format: 'esm',
		logLevel: 'silent',
		minify: true,
		platform: 'neutral',
		target: 'esnext',
		treeShaking: true,
		write: false,
		plugins:
			compiledComponent === undefined
				? []
				: [
						{
							name: 'compiled-server-component',
							setup(bundler) {
								bundler.onResolve({ filter: /^fixture:server-component$/ }, () => ({
									path: 'ProductionServerPage.tsrx',
									namespace: 'fixture',
								}));
								bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
									contents: compiledComponent,
									loader: 'js',
									resolveDir: packageRoot,
								}));
							},
						},
					],
	});

	// A runtime failure should name the entry, not print the entire base64 bundle
	// in every stack frame.
	const code = result.outputFiles[0].text + '\n//# sourceURL=octane-production-server-bundle.js';
	return import(
		`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
	) as Promise<T>;
}

describe('production-bundled server rendering', () => {
	it.each([
		{ name: 'class', attrs: { class: 'spread' }, classes: ['spread'] },
		{ name: 'className', attrs: { className: 'spread' }, classes: ['spread'] },
		{
			name: 'an array class',
			attrs: { class: ['spread', { extra: true }] },
			classes: ['spread', 'extra'],
		},
		{ name: 'an empty spread', attrs: {}, classes: [] },
		{ name: 'a null class', attrs: { class: null }, classes: [] },
		{ name: 'a false class', attrs: { class: false }, classes: [] },
	])('keeps scoped styles and authored class precedence with $name', async ({ attrs, classes }) => {
		const { render } = await productionServerModule<{
			render: (attrs: Record<string, unknown>) => { html: string; css: string };
		}>(
			`
import { renderToString } from 'octane/server';
import { Page } from 'fixture:server-component';
export const render = (attrs) => renderToString(Page, { attrs });
`,
			`
export function Page(props: { attrs: Record<string, unknown> }) @{
	<main>
		<style>
			div { color: red; }
		</style>
		<div data-case="spread" {...props.attrs}>{'Spread'}</div>
		<div data-case="after" {...props.attrs} class="authored">{'After'}</div>
		<div data-case="before" class="authored" {...props.attrs}>{'Before'}</div>
	</main>
}
`,
		);
		const { html, css } = render(attrs);
		const browser = new JSDOM(`<html><head>${css}</head><body>${html}</body></html>`);
		try {
			const document = browser.window.document;
			const rule = document.styleSheets[0].cssRules[0] as CSSStyleRule;
			const spread = document.querySelector('[data-case="spread"]')!;
			const after = document.querySelector('[data-case="after"]')!;
			const before = document.querySelector('[data-case="before"]')!;

			expect(rule.style.getPropertyValue('color')).toBe('red');
			expect(spread.matches(rule.selectorText)).toBe(true);
			for (const name of classes) expect(spread.classList.contains(name)).toBe(true);

			expect(after.matches(rule.selectorText)).toBe(true);
			expect(after.classList.contains('authored')).toBe(true);
			for (const name of classes) expect(after.classList.contains(name)).toBe(false);

			if ('class' in attrs || 'className' in attrs) {
				// A later spread still replaces the earlier authored class, including its scope.
				expect(before.className).toBe(classes.join(' '));
				expect(before.matches(rule.selectorText)).toBe(false);
			} else {
				expect(before.className).toBe(after.className);
				expect(before.matches(rule.selectorText)).toBe(true);
			}
		} finally {
			browser.window.close();
		}
	});

	it.each([false, true])(
		'preserves spread reads and winning prop coercion order when coercion throws: %s',
		async (throws) => {
			const { render } = await productionServerModule<{
				render: (props: Record<string, unknown>) => string;
			}>(
				`
import { renderToString } from 'octane/server';
import { Page } from 'fixture:server-component';
export const render = (props) => renderToString(Page, props).html;
`,
				`
export function Page(props) @{
	<div title={props.read('first')} {...props.spread} data-last={props.read('last')} title={props.finalTitle} />
}
`,
			);
			const trace: string[] = [];
			const ignored = {
				toString() {
					throw new Error('Overwritten or filtered props must not coerce');
				},
			};
			let middle = 'original';
			const target: Record<PropertyKey, unknown> = {
				get title() {
					trace.push('getter:title');
					return ignored;
				},
				'data-middle': {
					toString() {
						trace.push('coerce:middle');
						return middle;
					},
				},
				onclick: ignored,
				key: ignored,
				ref: ignored,
				'bad name': ignored,
				[Symbol('ignored')]: ignored,
			};
			const spread = new Proxy(target, {
				ownKeys(object) {
					trace.push('keys');
					return Reflect.ownKeys(object);
				},
				get(object, name) {
					trace.push(`get:${String(name)}`);
					return Reflect.get(object, name);
				},
			});
			const failure = new Error('Winning title failed');
			const props = {
				spread,
				read(name: string) {
					trace.push(`read:${name}`);
					return name === 'first'
						? ignored
						: {
								toString() {
									trace.push('coerce:last');
									return 'last';
								},
							};
				},
				finalTitle: {
					toString() {
						trace.push('coerce:title');
						if (throws) throw failure;
						target['data-middle'] = 'replacement';
						middle = 'mutated <&';
						return 'final';
					},
				},
			};

			if (throws) expect(() => render(props)).toThrow(failure);
			else {
				expect(render(props)).toBe(
					'<div title="final" data-middle="mutated <&amp;" data-last="last"></div>',
				);
			}
			expect(trace).toEqual([
				'read:first',
				'keys',
				'get:title',
				'getter:title',
				'get:data-middle',
				'get:onclick',
				'get:key',
				'get:ref',
				'get:bad name',
				'get:Symbol(ignored)',
				'read:last',
				'coerce:title',
				...(throws ? [] : ['coerce:middle', 'coerce:last']),
			]);
			expect(render({ spread: {}, read: () => 'next', finalTitle: 'recovered' })).toBe(
				'<div title="recovered" data-last="next"></div>',
			);
		},
	);

	it('retains winning alias positions and removes attributes with null or false final writers', async () => {
		const { render } = await productionServerModule<{
			render: (props: Record<string, unknown>) => string;
		}>(
			`
import { renderToString } from 'octane/server';
import { Page } from 'fixture:server-component';
export const render = (props) => renderToString(Page, props).html;
`,
			`export function Page(props) @{ <label {...props.first} id={props.id} {...props.last} /> }`,
		);
		for (const final of ['final', null, false]) {
			const trace: string[] = [];
			const tracked = (value: string) => ({
				toString() {
					trace.push(value);
					return value;
				},
			});
			expect(
				render({
					first: {
						htmlFor: tracked('overwritten'),
						TITLE: tracked('overwritten'),
						className: 'old',
					},
					id: tracked('id'),
					last: { for: final === 'final' ? tracked(final) : final, title: null, class: false },
				}),
			).toBe(final === 'final' ? '<label id="id" for="final"></label>' : '<label id="id"></label>');
			expect(trace).toEqual(final === 'final' ? ['id', 'final'] : ['id']);
		}
	});

	it('preserves namespace-sensitive names and custom-element attributes across spreads', async () => {
		const { render } = await productionServerModule<{
			render: (props: Record<string, unknown>) => string;
		}>(
			`
import { renderToString } from 'octane/server';
import { Page } from 'fixture:server-component';
export const render = (props) => renderToString(Page, props).html;
`,
			`
export function Page(props) @{
	<main>
		<custom-panel {...props.custom} />
		<custom-panel {...props.aliases} />
		<svg {...props.svg} />
		<svg {...props.svgAliases} />
		<math {...props.math} />
	</main>
}
`,
		);
		expect(
			render({
				custom: { onclick: 'custom handler', 'data-ready': false },
				aliases: { htmlFor: 'verbatim', for: 'native', className: ['a', 'b'] },
				svg: { viewBox: '0 0 1 1', viewbox: 'lower' },
				svgAliases: { strokeWidth: '1', 'stroke-width': null },
				math: { mathvariant: 'bold', mathVariant: 'mixed' },
			}),
		).toBe(
			'<main><custom-panel onclick="custom handler" data-ready="false"></custom-panel>' +
				'<custom-panel htmlFor="verbatim" for="native" class="a b"></custom-panel>' +
				'<svg viewBox="0 0 1 1" viewbox="lower"></svg>' +
				'<svg></svg>' +
				'<math mathvariant="bold" mathVariant="mixed"></math></main>',
		);
	});

	it('projects spread form state and raw content without serializing their control props', async () => {
		const { render } = await productionServerModule<{
			render: (props: Record<string, unknown>) => string;
		}>(
			`
import { renderToString } from 'octane/server';
import { Page } from 'fixture:server-component';
export const render = (props) => renderToString(Page, props).html;
`,
			`
export function Page(props) @{
	<main>
		<input {...props.input} />
		<textarea {...props.textarea} />
		<select {...props.select}><option value="a">A</option><option value="b">B</option></select>
		<div {...props.content} />
		<svg {...props.svgContent} />
	</main>
}
`,
		);
		const document: Document = new JSDOM(
			render({
				input: { value: 'controlled', checked: false, title: 'input' },
				textarea: { value: 'text <&', title: 'textarea' },
				select: { value: ['b'], multiple: true, title: 'select' },
				content: { dangerouslySetInnerHTML: { __html: '<strong>raw content</strong>' } },
				svgContent: { dangerouslySetInnerHTML: { __html: '<circle r="4"></circle>' } },
			}),
		).window.document;
		const input = document.querySelector('input')!;
		expect(input.value).toBe('controlled');
		expect(input.checked).toBe(false);
		expect(input.title).toBe('input');
		const textarea = document.querySelector('textarea')!;
		expect(textarea.value).toBe('text <&');
		expect(textarea.hasAttribute('value')).toBe(false);
		const select = document.querySelector('select')!;
		expect(Array.from(select.selectedOptions, (option) => option.value)).toEqual(['b']);
		expect(select.multiple).toBe(true);
		expect(select.hasAttribute('value')).toBe(false);
		const content = document.querySelector('main > div')!;
		expect(content.innerHTML).toBe('<strong>raw content</strong>');
		expect(content.getAttributeNames()).toEqual([]);
		const svg = document.querySelector('svg')!;
		expect(svg.querySelector('circle')?.getAttribute('r')).toBe('4');
		expect(svg.getAttributeNames()).toEqual([]);
	});

	it('renders public client Activity descriptors without retaining the server sentinel export', async () => {
		const { visible, hidden } = await productionServerModule<{
			visible: string;
			hidden: string;
		}>(`
import { Activity, createElement } from 'octane';
import { renderToStaticMarkup } from 'octane/server';

function HiddenChild() {
	throw new Error('Hidden Activity children must not render on the server');
}

export const visible = renderToStaticMarkup(() =>
	createElement(Activity, null, createElement('span', null, 'visible')),
).html;
export const hidden = renderToStaticMarkup(() =>
	createElement(Activity, { mode: 'hidden' }, createElement(HiddenChild)),
).html;
`);

		expect(visible).toBe('<span>visible</span>');
		expect(hidden).toBe('');
	});

	it('preserves permanent-static markup alongside an explicitly retained deferred boundary', async () => {
		const component = `
import { Hydrate } from 'octane';
import { load, never } from 'octane/hydration';

export function Page() @{
	<main>
		<Hydrate split={false} when={never()}>
			<aside id="server-owned">{'Permanent content'}</aside>
		</Hydrate>
		<Hydrate split={false} when={load()}>
			<strong id="deferred-content">{'Deferred content'}</strong>
		</Hydrate>
	</main>
}
`;
		const { html } = await productionServerModule<{ html: string }>(
			`
import { renderToString } from 'octane/server';
import { Page } from 'fixture:server-component';
export const html = renderToString(Page).html;
`,
			component,
		);
		const document = new JSDOM(html).window.document;
		const main = document.querySelector('main');
		const staticContent = main?.querySelector('#server-owned');
		const deferredContent = main?.querySelector('#deferred-content');

		expect(staticContent?.textContent).toBe('Permanent content');
		expect(staticContent?.parentElement).toBe(main);
		expect(deferredContent?.textContent).toBe('Deferred content');
		expect(deferredContent?.parentElement?.getAttribute('data-octane-hydrate-when')).toBe('load');
	});

	it('keeps mixed-case SVG host inference and restores HTML inside foreignObject', async () => {
		const { html } = await productionServerModule<{ html: string }>(`
import { createElement, renderToStaticMarkup } from 'octane/server';

function Page() {
	return createElement(
		'clipPath',
		null,
		createElement('custom-shape', { accentHeight: '10' }),
		createElement('foreignObject', null,
			createElement('custom-panel', { accentHeight: '7' }, 'HTML content'),
		),
	);
}

export const html = renderToStaticMarkup(Page).html;
`);

		expect(html).toBe(
			'<clipPath><custom-shape accent-height="10"></custom-shape>' +
				'<foreignObject><custom-panel accentHeight="7">HTML content</custom-panel>' +
				'</foreignObject></clipPath>',
		);
	});

	it('reveals independent suspended responses across repeated production streams', async () => {
		const { render } = await productionServerModule<{
			render: (value: string) => Promise<{ shell: string; html: string }>;
		}>(`
import { createElement, renderToReadableStream, Suspense, use } from 'octane/server';

function Content(props) {
	return createElement('strong', { id: 'revealed' }, use(props.promise));
}

function Page(props) {
	return createElement(
		Suspense,
		{ fallback: createElement('p', { id: 'pending' }, 'Loading content') },
		createElement(Content, { promise: props.promise }),
	);
}

export async function render(value) {
	let resolve;
	const promise = new Promise((done) => { resolve = done; });
	const stream = await renderToReadableStream(Page, { promise });
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const initial = await reader.read();
	const shell = decoder.decode(initial.value);
	resolve(value);
	const chunks = [shell];
	for (;;) {
		const chunk = await reader.read();
		if (chunk.done) break;
		chunks.push(decoder.decode(chunk.value));
	}
	await stream.allReady;
	return { shell, html: chunks.join('') };
}
`);

		for (const label of ['first response', 'second response']) {
			const { shell, html } = await render(label);
			const pendingDocument = new JSDOM(shell).window.document;
			expect(pendingDocument.querySelector('#pending')?.textContent).toBe('Loading content');

			const browser = new JSDOM('', { url: 'https://octane.test/' });
			const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
			const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
			Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis });
			Object.defineProperty(globalThis, 'document', {
				configurable: true,
				value: browser.window.document,
			});
			const container = browser.window.document.createElement('div');
			container.innerHTML = html;
			browser.window.document.body.appendChild(container);
			try {
				activateStreamedMarkup(container);
				expect(container.querySelector('#pending')).toBeNull();
				expect(container.querySelector('#revealed')?.textContent).toBe(label);
			} finally {
				container.remove();
				resetStreamRuntimeGlobals();
				if (previousWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
				else Object.defineProperty(globalThis, 'window', previousWindow);
				if (previousDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
				else Object.defineProperty(globalThis, 'document', previousDocument);
			}
		}
	});
});
