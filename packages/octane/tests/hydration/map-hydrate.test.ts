import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { MapList, reorder } from './_fixtures/map-list.tsx';

// A React-style `.tsx` `{items.map(x => <li key/>)}` keyed list lowers to the
// forBlock fast path on the client and the matching ssrBlock path on the server
// (NOT a `ssrChild(descriptor[])` / `childSlot` de-opt array). This test pins
// that server + client agree: the server-rendered <li>s are ADOPTED on hydrate
// (same nodes, not rebuilt) and a post-hydration keyed reorder reuses them.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/map-list.tsx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'map-list.tsx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}

describe('hydrateRoot — `.tsx` `.map()` keyed list (forBlock parity)', () => {
	const server = serverModule();
	let container: HTMLElement;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});
	afterEach(() => container.remove());

	it('server lowers `.map` to the keyed ssrBlock path (not a childSlot descriptor array)', () => {
		const { code } = compile(readFileSync(FIXTURE, 'utf8'), 'map-list.tsx', { mode: 'server' });
		expect(code).toContain('ssrBlock');
		// No per-row createElement descriptor reconciled by ssrChild.
		expect(code).not.toMatch(/ssrChild\([^)]*createElement\(\s*['"]li['"]/);
	});

	it('adopts the server-rendered list items (same nodes) and a keyed reorder reuses them', async () => {
		const { html } = ServerRT.renderToString(server.MapList, {});
		expect(html).toContain('data-id="1"');
		expect(html).toContain('data-id="3"');

		container.innerHTML = html;
		const lis = Array.from(container.querySelectorAll('li.row')) as HTMLElement[];
		expect(lis.map((li) => li.getAttribute('data-id'))).toEqual(['1', '2', '3']);
		expect(lis.map((li) => li.textContent)).toEqual(['a', 'b', 'c']);
		const [li1, li2, li3] = lis;

		hydrateRoot(container, MapList, {});
		flushSync(() => {});

		// Adopted, not rebuilt: the same DOM nodes are still in place.
		const afterHydrate = Array.from(container.querySelectorAll('li.row'));
		expect(afterHydrate).toEqual([li1, li2, li3]);

		// Keyed reorder (move id:3 to front): survivors keep their identity.
		flushSync(() => reorder());
		const reordered = Array.from(container.querySelectorAll('li.row')) as HTMLElement[];
		expect(reordered.map((li) => li.getAttribute('data-id'))).toEqual(['3', '1', '2']);
		// The three <li> instances are the SAME nodes, just reordered.
		expect(new Set(reordered)).toEqual(new Set([li1, li2, li3]));
		expect(reordered[0]).toBe(li3);
	});
});
