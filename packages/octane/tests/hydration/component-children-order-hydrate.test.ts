import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { WideTrio, TrailingPanel } from '../_fixtures/component-children-host.tsrx';

// All-component-children hosts across SSR + hydration: the client adopts each
// child's server range, and a child whose branch was EMPTY on the server must
// place content rendered by a post-hydration update at its own source position,
// ahead of later siblings — the same sibling-order contract the client-mount
// suite pins (component-children-host.test.ts).

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/component-children-host.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'component-children-host.tsrx', {
		mode: 'server',
	});
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}
const server = serverModule();

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

const order = () =>
	[...container.querySelector('section.host')!.children].map(
		(el) => `${el.className}:${el.textContent}`,
	);

describe('hydrateRoot — all-component-children host sibling order', () => {
	it('adopts children that rendered content on the server (same elements, source order)', () => {
		const { html } = ServerRT.renderToString(server.WideTrio, { bBig: true });
		container.innerHTML = html;
		const big = container.querySelector('.big');
		const leaf = container.querySelector('.leaf');

		const root = hydrateRoot(container, WideTrio, { bBig: true });
		flushSync(() => {});
		expect(container.querySelector('.big')).toBe(big);
		expect(container.querySelector('.leaf')).toBe(leaf);
		expect(order()).toEqual(['big:B', 'leaf:C']);
		root.unmount();
	});

	it('a server-EMPTY panel renders before its later sibling after a client update', () => {
		const { html } = ServerRT.renderToString(server.WideTrio, { bBig: false });
		container.innerHTML = html;
		const leaf = container.querySelector('.leaf');

		const root = hydrateRoot(container, WideTrio, { bBig: false });
		flushSync(() => {});
		expect(order()).toEqual(['leaf:C']);
		expect(container.querySelector('.leaf')).toBe(leaf); // adopted, not rebuilt

		flushSync(() => root.render(WideTrio, { bBig: true }));
		expect(order()).toEqual(['big:B', 'leaf:C']);
		expect(container.querySelector('.leaf')).toBe(leaf); // sibling undisturbed

		flushSync(() => root.render(WideTrio, { bBig: false }));
		expect(order()).toEqual(['leaf:C']);
		flushSync(() => root.render(WideTrio, { bBig: true }));
		expect(order()).toEqual(['big:B', 'leaf:C']);
		root.unmount();
	});

	it('a server-EMPTY trailing panel appears after its earlier sibling on update', () => {
		const { html } = ServerRT.renderToString(server.TrailingPanel, { zBig: false });
		container.innerHTML = html;

		const root = hydrateRoot(container, TrailingPanel, { zBig: false });
		flushSync(() => {});
		expect(order()).toEqual(['leaf:A']);

		flushSync(() => root.render(TrailingPanel, { zBig: true }));
		expect(order()).toEqual(['leaf:A', 'big:Z']);
		root.unmount();
	});
});
