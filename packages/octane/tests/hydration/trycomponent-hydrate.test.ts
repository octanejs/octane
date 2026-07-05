import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { prerender } from 'octane/static';
import { TryFor, TryComponent, TryComponentFor, MatchShape } from './_fixtures/trycomponent.tsrx';

// SSR Phase 6 — hydration of a @try whose SUCCESS-arm body is a COMPONENT (the
// router `Match` shape: `@try { <Comp/> } @pending { … }`). The server resolves
// use() and renders the success arm; inside the arm the component's output is its
// OWN block range. The client adopts the @try range, then the inner component slot
// adopts the component's range — no rebuild, no throw.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/trycomponent.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'trycomponent.tsrx', { mode: 'server' });
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

const items = [
	{ id: 1, name: 'Alpha' },
	{ id: 2, name: 'Beta' },
];

describe('hydrateRoot — @try with a component body (router Match shape)', () => {
	// Shape (a): @try { @for } — the body is a @for directly (a sole-hole arm).
	it('(a) adopts a @try whose body is a @for directly (no throw, no rebuild)', async () => {
		const { html } = await prerender(server.TryFor, { promise: Promise.resolve(items) });
		container.innerHTML = html;
		// Snapshot the #try-for subtree (NOT container.innerHTML — that includes the
		// inline suspense seed <script>, which hydrateRoot consumes + removes).
		const wrapper = container.querySelector('#try-for') as HTMLElement;
		const before = wrapper.outerHTML;
		const lis = [...container.querySelectorAll('li.item')];
		expect(lis.length).toBe(2);
		expect(lis.map((l) => l.textContent)).toEqual(['Alpha', 'Beta']);

		const root = hydrateRoot(container, TryFor, { promise: Promise.resolve(items) });
		flushSync(() => {});

		// Adopted, no rebuild, no @pending; seed script consumed.
		expect((container.querySelector('#try-for') as HTMLElement).outerHTML).toBe(before);
		expect([...container.querySelectorAll('li.item')]).toEqual(lis);
		expect(container.querySelector('.loading')).toBeNull();
		expect(container.querySelector('script[data-octane-suspense]')).toBeNull();
		root.unmount();
	});

	// Shape (b): @try { <Comp/> } — THROWS pre-fix.
	it('(b) adopts a @try whose body is a component (no throw, no rebuild)', async () => {
		const { html } = await prerender(server.TryComponent, {
			promise: Promise.resolve('hello'),
		});
		container.innerHTML = html;
		const wrapper = container.querySelector('#try-comp') as HTMLElement;
		const before = wrapper.outerHTML;
		const leaf = container.querySelector('.leaf') as HTMLElement;
		expect(leaf).not.toBeNull();
		expect(leaf.textContent).toBe('hello');

		const root = hydrateRoot(container, TryComponent, { promise: Promise.resolve('hello') });
		flushSync(() => {});

		// The component subtree was ADOPTED (same node), no rebuild, no @pending.
		expect(container.querySelector('.leaf')).toBe(leaf);
		expect((container.querySelector('#try-comp') as HTMLElement).outerHTML).toBe(before);
		expect(container.querySelector('.loading')).toBeNull();
		expect(container.querySelector('.leaf')!.textContent).toBe('hello');
		expect(container.querySelector('script[data-octane-suspense]')).toBeNull();
		root.unmount();
	});

	// Shape (c): @try { <Comp/> } where Comp contains a @for — THROWS pre-fix.
	it('(c) adopts a @try whose component body itself contains a @for (no throw, no rebuild)', async () => {
		const { html } = await prerender(server.TryComponentFor, {
			promise: Promise.resolve(items),
		});
		container.innerHTML = html;
		const wrapper = container.querySelector('#try-comp-for') as HTMLElement;
		const before = wrapper.outerHTML;
		const ul = container.querySelector('ul.list-leaf') as HTMLElement;
		const rows = [...container.querySelectorAll('li.row')];
		expect(rows.length).toBe(2);
		expect(rows.map((r) => r.textContent)).toEqual(['Alpha', 'Beta']);

		const root = hydrateRoot(container, TryComponentFor, { promise: Promise.resolve(items) });
		flushSync(() => {});

		// Adopted: same <ul>, same <li> instances, no rebuild, no @pending.
		expect(container.querySelector('ul.list-leaf')).toBe(ul);
		expect([...container.querySelectorAll('li.row')]).toEqual(rows);
		expect((container.querySelector('#try-comp-for') as HTMLElement).outerHTML).toBe(before);
		expect(container.querySelector('.loading')).toBeNull();
		expect(container.querySelector('script[data-octane-suspense]')).toBeNull();
		root.unmount();
	});

	// The exact router `Match` shape: @try { <Comp/> } @pending { <Fallback/> }.
	it('adopts the router Match shape (@try component body + @pending component fallback)', async () => {
		const { html } = await prerender(server.MatchShape, {
			promise: Promise.resolve('route'),
		});
		container.innerHTML = html;
		const wrapper = container.querySelector('#match') as HTMLElement;
		const before = wrapper.outerHTML;
		const matched = container.querySelector('.matched') as HTMLElement;
		expect(matched).not.toBeNull();
		expect(matched.textContent).toBe('route');
		expect(container.querySelector('.fallback')).toBeNull();

		const root = hydrateRoot(container, MatchShape, { promise: Promise.resolve('route') });
		flushSync(() => {});

		expect(container.querySelector('.matched')).toBe(matched);
		expect((container.querySelector('#match') as HTMLElement).outerHTML).toBe(before);
		expect(container.querySelector('.fallback')).toBeNull();
		expect(container.querySelector('script[data-octane-suspense]')).toBeNull();
		root.unmount();
	});
});
