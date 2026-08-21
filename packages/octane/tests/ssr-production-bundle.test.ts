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
