/**
 * Hydration — a server-rendered MDX document adopts into the client-compiled
 * module via `hydrateRoot`: byte-identical DOM, adopted (not rebuilt) nodes,
 * no mismatch warnings, and embedded interactive components stay live.
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
import { hydrateRoot, flushSync, createElement } from 'octane';
import * as ServerRT from 'octane/server';
import { compile as octaneCompile } from 'octane/compiler';
import { compileMdxSync } from '@octanejs/mdx/compile';
import { MDXProvider } from '@octanejs/mdx';
import * as ServerProvider from '@octanejs/mdx/server';
import { evalModuleCode } from './_helpers';
// @ts-expect-error — .mdx modules are produced by the vite plugin; no ambient types in tests.
import BasicDoc from './_fixtures/basic.mdx';
// @ts-expect-error — see above.
import ComponentsDoc from './_fixtures/components.mdx';

const FIXTURES = join(process.cwd(), 'packages/mdx/tests/_fixtures');

// Server-compile an `.mdx` fixture through the pipeline. The provider import
// is the REAL `@octanejs/mdx/server` (the server-mode default).
function serverMdxModule(name: string, extraMods: Record<string, any> = {}): Record<string, any> {
	const file = join(FIXTURES, name);
	const { code } = compileMdxSync(readFileSync(file, 'utf8'), file, { mode: 'server' });
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
	it('adopts a server-rendered markdown document byte-for-byte', () => {
		const mod = serverMdxModule('basic.mdx');
		const { html } = ServerRT.renderToString(mod.default, {});
		container.innerHTML = html;
		const h1 = container.querySelector('h1');
		const em = container.querySelector('em');
		const lis = [...container.querySelectorAll('li')];

		const root = hydrateRoot(container, BasicDoc, {});
		flushSync(() => {});
		// Byte adoption: hydration changed NOTHING (markers included).
		expect(container.innerHTML).toBe(html);
		// The server nodes were adopted, not rebuilt.
		expect(container.querySelector('h1')).toBe(h1);
		expect(container.querySelector('em')).toBe(em);
		expect([...container.querySelectorAll('li')]).toEqual(lis);
		root.unmount();
	});

	it('adopts a document with an embedded .tsrx component and keeps it interactive', () => {
		const counter = serverTsrxModule('counter.tsrx');
		const mod = serverMdxModule('components.mdx', { './counter.tsrx': counter });
		const { html } = ServerRT.renderToString(mod.default, {});
		expect(html).toContain('count: 2');
		expect(html).toContain('The answer is 42.');
		container.innerHTML = html;
		const btn = container.querySelector('[data-testid="counter"]') as HTMLButtonElement;

		const root = hydrateRoot(container, ComponentsDoc, {});
		flushSync(() => {});
		expect(container.innerHTML).toBe(html);
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

		const root = hydrateRoot(container, BasicDoc, props);
		flushSync(() => {});
		expect(container.innerHTML).toBe(html);
		expect(container.querySelector('h2')).toBe(h2);
		root.unmount();
	});

	// The server provider (@octanejs/mdx/server) and the client provider mount
	// the same component-frame shape, so a document server-rendered under the
	// server MDXProvider hydrates byte-for-byte into the client MDXProvider.
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

		const root = hydrateRoot(container, MDXProvider, {
			components,
			children: createElement(BasicDoc),
		});
		flushSync(() => {});
		expect(container.innerHTML).toBe(html);
		expect(container.querySelector('h2')).toBe(h2);
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
});
