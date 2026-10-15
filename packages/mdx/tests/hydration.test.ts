/**
 * Hydration — a server-rendered MDX document adopts into the client-compiled
 * module via `hydrateRoot`: logically equivalent DOM, adopted (not rebuilt)
 * nodes, no mismatch warnings, and embedded interactive components stay live.
 *
 * The server side compiles the SAME `.mdx` source with `mode: 'server'` and
 * evaluates it with the server runtime injected (the ssr.test.ts eval trick,
 * extended to resolve the document's own imports — e.g. an embedded `.tsrx`
 * component is itself server-compiled and injected). The client side is the
 * real plugin-compiled module import. Rig modeled on
 * packages/octane/tests/hydration/host-string-tag-hydrate.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, hydrateRoot, flushSync, createElement } from 'octane';
import * as ClientRT from 'octane';
import * as ClientProvider from '@octanejs/mdx';
import * as ServerRT from 'octane/server';
import { compile as octaneCompile } from 'octane/compiler';
import { compileMdxSync, type CompileMdxOptions } from '@octanejs/mdx/compile';
import Counter from './_fixtures/counter.tsrx';
import { MDXProvider } from '@octanejs/mdx';
// @ts-expect-error The shared fixture loader compiles the provider graph for SSR.
import * as ServerProvider from './_fixtures/provider-server.ts?octane-ssr';
import { evalModuleCode, stripMarkers } from './_helpers';
// @ts-expect-error — .mdx modules are produced by the vite plugin; no ambient types in tests.
import BasicDoc from './_fixtures/basic.mdx';
// @ts-expect-error — see above.
import ComponentsDoc from './_fixtures/components.mdx';

const FIXTURES = join(process.cwd(), 'packages/mdx/tests/_fixtures');

// Server-compile an `.mdx` fixture through the pipeline. The provider import
// is the REAL `@octanejs/mdx/server` (the server-mode default).
function serverMdxModule(
	name: string,
	extraMods: Record<string, any> = {},
	options: CompileMdxOptions = {},
): Record<string, any> {
	const file = join(FIXTURES, name);
	const { code } = compileMdxSync(readFileSync(file, 'utf8'), file, { ...options, mode: 'server' });
	return evalModuleCode(code, {
		'octane/server': ServerRT,
		'@octanejs/mdx/server': ServerProvider,
		...extraMods,
	});
}

// Server-compile an embedded `.tsrx` component (the documents' imports must be
// server modules too — renderToString runs them, not the client-compiled ones).
function serverTsrxModule(name: string): Record<string, any> {
	const file = join(FIXTURES, name);
	const { code } = octaneCompile(readFileSync(file, 'utf8'), name, { mode: 'server' });
	return evalModuleCode(code, { 'octane/server': ServerRT });
}

let container: HTMLElement;
let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	errSpy = vi.spyOn(console, 'error');
});
afterEach(() => {
	// No hydration mismatch warnings (or any other error) in any test.
	expect(errSpy.mock.calls).toEqual([]);
	errSpy.mockRestore();
	container.remove();
});

describe('hydration', () => {
	it('adopts server-rendered markdown elements and text', () => {
		const mod = serverMdxModule('basic.mdx');
		const { html } = ServerRT.renderToString(mod.default, {});
		container.innerHTML = html;
		const h1 = container.querySelector('h1');
		const em = container.querySelector('em');
		const lis = [...container.querySelectorAll('li')];
		const text = [h1?.firstChild, em?.firstChild, ...lis.map((li) => li.firstChild)];

		const root = hydrateRoot(container, BasicDoc, {});
		flushSync(() => {});
		expect(stripMarkers(container.innerHTML)).toBe(stripMarkers(html));
		// The server nodes were adopted, not rebuilt.
		expect(container.querySelector('h1')).toBe(h1);
		expect(container.querySelector('em')).toBe(em);
		const adoptedLis = [...container.querySelectorAll('li')];
		expect(adoptedLis).toHaveLength(lis.length);
		adoptedLis.forEach((li, index) => expect(li).toBe(lis[index]));
		[h1?.firstChild, em?.firstChild, ...adoptedLis.map((li) => li.firstChild)].forEach(
			(node, index) => expect(node).toBe(text[index]),
		);
		root.unmount();
	});

	it('adopts a document with an embedded .tsrx component and keeps it interactive', async () => {
		const counter = serverTsrxModule('counter.tsrx');
		const mod = serverMdxModule('components.mdx', { './counter.tsrx': counter });
		const { html } = ServerRT.renderToString(mod.default, {});
		expect(html).toContain('count: 2');
		container.innerHTML = html;
		expect(container.textContent).toContain('The answer is 42.');
		const btn = container.querySelector('[data-testid="counter"]') as HTMLButtonElement;
		const headingText = container.querySelector('h1')?.firstChild;

		// `The answer is {answer + 2}.` renders adjacent text children, which
		// hydrate without a text mismatch.
		const recoverable: unknown[] = [];
		const root = hydrateRoot(
			container,
			ComponentsDoc,
			{},
			{ onRecoverableError: (error) => recoverable.push(error) },
		);
		flushSync(() => {});
		await act(() => {});
		expect(recoverable).toEqual([]);
		expect(stripMarkers(container.innerHTML)).toBe(stripMarkers(html));
		expect(container.querySelector('h1')?.firstChild).toBe(headingText);
		// Same button element (adopted), and the delegated event drives its state.
		expect(container.querySelector('[data-testid="counter"]')).toBe(btn);
		flushSync(() => btn.click());
		expect(btn.textContent).toBe('count: 3');
		root.unmount();
	});

	it('adopts with a components-prop mapping applied on both sides', () => {
		const mod = serverMdxModule('basic.mdx');
		const props = { components: { h1: 'h2', em: 'i' } };
		const { html } = ServerRT.renderToString(mod.default, props);
		expect(html).toContain('<h2>');
		expect(html).toContain('<i>');
		container.innerHTML = html;
		const h2 = container.querySelector('h2');
		const text = h2?.firstChild;

		const root = hydrateRoot(container, BasicDoc, props);
		flushSync(() => {});
		expect(stripMarkers(container.innerHTML)).toBe(stripMarkers(html));
		expect(container.querySelector('h2')).toBe(h2);
		expect(h2?.firstChild).toBe(text);
		root.unmount();
	});

	it('adopts a document rendered under the server MDXProvider into the client MDXProvider', () => {
		const mod = serverMdxModule('basic.mdx');
		const components = { h1: 'h2', em: 'i' };
		const { html } = ServerRT.renderToString(ServerProvider.MDXProvider as any, {
			components,
			children: ServerRT.createElement(mod.default as any, {}),
		});
		expect(html).toContain('<h2>');
		container.innerHTML = html;
		const h2 = container.querySelector('h2');
		const text = h2?.firstChild;

		const root = hydrateRoot(container, MDXProvider, {
			components,
			children: createElement(BasicDoc),
		});
		flushSync(() => {});
		expect(stripMarkers(container.innerHTML)).toBe(stripMarkers(html));
		expect(container.querySelector('h2')).toBe(h2);
		expect(h2?.firstChild).toBe(text);
		root.unmount();
	});

	it('updates after hydration: a mapping change re-renders the adopted document', () => {
		const mod = serverMdxModule('basic.mdx');
		const { html } = ServerRT.renderToString(mod.default, {});
		container.innerHTML = html;

		const root = hydrateRoot(container, BasicDoc, {});
		flushSync(() => {});
		root.render(BasicDoc, { components: { h1: 'h3' } });
		flushSync(() => {});
		expect(container.querySelector('h3')?.textContent).toBe('Hello, MDX');
		expect(container.querySelector('h1')).toBeNull();
		root.unmount();
	});

	it.each([undefined, ['h1']])(
		'preserves interactive children after hydration with overridable tags %j',
		async (overridableTags) => {
			const counter = serverTsrxModule('counter.tsrx');
			const options = { strong: true, overridableTags };
			const mod = serverMdxModule('components.mdx', { './counter.tsrx': counter }, options);
			const file = join(FIXTURES, 'components.mdx');
			const client = evalModuleCode(
				compileMdxSync(readFileSync(file, 'utf8'), file, options).code,
				{
					octane: ClientRT,
					'@octanejs/mdx': ClientProvider,
					'./counter.tsrx': { default: Counter },
				},
			);
			const components = { h1: 'h2', p: 'aside' };
			const { html } = ServerRT.renderToString(ServerProvider.MDXProvider as any, {
				components,
				children: ServerRT.createElement(mod.default as any, {}),
			});
			container.innerHTML = html;
			const heading = container.querySelector('h2');
			const button = container.querySelector<HTMLButtonElement>('[data-testid="counter"]')!;
			expect(heading?.textContent).toBe('Interactive');
			expect(button.textContent).toBe('count: 2');
			expect(
				container.querySelector(overridableTags === undefined ? 'aside' : 'p')?.textContent,
			).toBe('The answer is 42.');
			const children = createElement(client.default);
			const recoverable: unknown[] = [];
			const root = hydrateRoot(
				container,
				MDXProvider,
				{ components, children },
				{ onRecoverableError: (error) => recoverable.push(error) },
			);
			try {
				await act(() => {});
				expect(container.querySelector('h2')).toBe(heading);
				expect(container.querySelector('[data-testid="counter"]')).toBe(button);
				flushSync(() => button.click());
				expect(button.textContent).toBe('count: 3');

				flushSync(() => root.render(MDXProvider, { components: { h1: 'h3' }, children }));
				expect(container.querySelector('h3')?.textContent).toBe('Interactive');
				expect(container.querySelector('h2')).toBeNull();
				expect(container.querySelector('[data-testid="counter"]')).toBe(button);
				expect(button.textContent).toBe('count: 3');
				flushSync(() => button.click());
				expect(button.textContent).toBe('count: 4');
				expect(recoverable).toEqual([]);
			} finally {
				root.unmount();
			}
			expect(container.textContent).toBe('');
		},
	);
});
