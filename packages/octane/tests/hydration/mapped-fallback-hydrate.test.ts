import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { MappedFallbackList } from './_fixtures/mapped-fallback-list.tsx';

// `{items.map(...)}` compiles to the guarded map ABI: the runtime asks whether
// `items` is a plain native array and, when it is not, applies the authored
// callback itself and renders the resulting descriptors as a de-opt list — the
// MAPPED FALLBACK. That fallback shares `childSlot`'s keyed list machinery with
// ordinary descriptor lists but must NOT be treated as one during hydration: an
// ordinary de-opt list's pure items self-delimit, while a fallback list keeps
// the framing the server actually wrote. These tests pin that a fallback list
// hydrates by ADOPTING the server rows rather than rebuilding them, and that it
// stays keyed afterwards.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/mapped-fallback-list.tsx',
);

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'mapped-fallback-list.tsx', {
		mode: 'server',
	});
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}

// An array the native-map guard must reject: one index is an accessor, so the
// compiled item body cannot be replayed and the authored callback runs instead.
function accessorArray<T>(values: T[]): T[] {
	const out: T[] = [];
	for (let index = 0; index < values.length; index++) {
		if (index === 1) {
			Object.defineProperty(out, index, {
				get: () => values[index],
				enumerable: true,
				configurable: true,
			});
		} else out[index] = values[index];
	}
	out.length = values.length;
	return out;
}

const ITEMS = [
	{ id: 1, label: 'a' },
	{ id: 2, label: 'b' },
	{ id: 3, label: 'c' },
];

describe('hydrateRoot — mapped-fallback keyed list', () => {
	const server = serverModule();
	let container: HTMLElement;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});
	afterEach(() => container.remove());

	it('compiles to the guarded map ABI', () => {
		const { code } = compile(readFileSync(FIXTURE, 'utf8'), 'mapped-fallback-list.tsx', {
			mode: 'client',
			hmr: false,
			dev: false,
		});
		expect(code).toContain('mapSlot');
	});

	it('adopts the server rows when the array forces the fallback', () => {
		const { html } = ServerRT.renderToString(server.MappedFallbackList, { items: ITEMS });
		container.innerHTML = html;
		const rows = [...container.querySelectorAll('li.fallback-row')];
		expect(rows.map((row) => row.getAttribute('data-id'))).toEqual(['1', '2', '3']);

		const root = hydrateRoot(container, MappedFallbackList, { items: accessorArray(ITEMS) });
		flushSync(() => {});

		// Adopted, not rebuilt: the same element instances are still in place.
		expect([...container.querySelectorAll('li.fallback-row')]).toEqual(rows);
		expect(rows.map((row) => row.textContent)).toEqual(['a', 'b', 'c']);
		root.unmount();
	});

	it('stays keyed across a post-hydration reorder on the fallback path', () => {
		const { html } = ServerRT.renderToString(server.MappedFallbackList, { items: ITEMS });
		container.innerHTML = html;
		const rows = [...container.querySelectorAll('li.fallback-row')];

		const root = hydrateRoot(container, MappedFallbackList, { items: accessorArray(ITEMS) });
		flushSync(() => {});

		flushSync(() =>
			root.render(MappedFallbackList, {
				items: accessorArray([ITEMS[2], ITEMS[0], ITEMS[1]]),
			}),
		);
		const reordered = [...container.querySelectorAll('li.fallback-row')];
		expect(reordered.map((row) => row.getAttribute('data-id'))).toEqual(['3', '1', '2']);
		// Survivors keep their identity — the same three nodes, reordered.
		expect(new Set(reordered)).toEqual(new Set(rows));
		expect(reordered[0]).toBe(rows[2]);
		root.unmount();
	});
});
