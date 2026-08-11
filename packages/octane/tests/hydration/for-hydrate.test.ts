import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';
import {
	ComponentList,
	ExplicitKeyComponentList,
	IndexedList,
	List,
} from './_fixtures/forlist.tsrx';

// SSR Phase 6 (M2) — a keyed @for list hydrates: the server wraps the @for in
// one block range and lets each proven direct-host item self-delimit. The client
// adopts those roots (no rebuild) and attaches per-item event handlers.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/forlist.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'forlist.tsrx', { mode: 'server' });
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

describe('hydrateRoot — @for list (SSR Phase 6 / M2)', () => {
	it('adopts explicit index-keyed rows and preserves their positional identity', () => {
		const items = [
			{ id: 1, name: 'Alpha' },
			{ id: 2, name: 'Beta' },
			{ id: 3, name: 'Gamma' },
		];
		const { html } = ServerRT.renderToString(server.IndexedList, { items });
		container.innerHTML = html;
		const rows = [...container.querySelectorAll('li.indexed-row')];

		const root = hydrateRoot(container, IndexedList, { items });
		flushSync(() => {});
		expect([...container.querySelectorAll('li.indexed-row')]).toEqual(rows);

		flushSync(() => root.render(IndexedList, { items: [items[2], items[1], items[0]] }));
		expect([...container.querySelectorAll('li.indexed-row')]).toEqual(rows);
		expect(rows.map((row) => row.querySelector('.name')?.textContent)).toEqual([
			'Gamma',
			'Beta',
			'Alpha',
		]);
		root.unmount();
	});

	it('adopts the server-rendered items (no rebuild) and per-item handlers work', async () => {
		const items = [
			{ id: 1, name: 'Alpha' },
			{ id: 2, name: 'Beta' },
			{ id: 3, name: 'Gamma' },
		];
		const onPick = vi.fn();
		const { html } = ServerRT.renderToString(server.List, { items, onPick: () => {} });
		expect((html.match(/<!--\[/g) || []).length).toBe(1);

		container.innerHTML = html;
		const before = container.innerHTML;
		const rows = [...container.querySelectorAll('li.row')];
		expect(rows.length).toBe(3);
		expect(rows.map((r) => (r.querySelector('.name') as HTMLElement).textContent)).toEqual([
			'Alpha',
			'Beta',
			'Gamma',
		]);

		const root = hydrateRoot(container, List, { items, onPick });
		flushSync(() => {});

		// No rebuild: same DOM + same adopted <li> instances.
		expect(container.innerHTML).toBe(before);
		expect([...container.querySelectorAll('li.row')]).toEqual(rows);

		// Per-item handler attached to the adopted button → fires with the row id.
		const betaPick = rows[1].querySelector('button.pick') as HTMLButtonElement;
		flushSync(() => betaPick.click());
		expect(onPick).toHaveBeenCalledExactlyOnceWith(2);
		root.unmount();
	});

	it('also adopts legacy per-item pairs when the client can self-delimit rows', () => {
		const items = [
			{ id: 1, name: 'Alpha' },
			{ id: 2, name: 'Beta' },
		];
		const { html } = ServerRT.renderToString(server.List, { items, onPick: () => {} });
		container.innerHTML = html;
		const rows = [...container.querySelectorAll('li.row')];
		for (const row of rows) {
			row.parentNode!.insertBefore(document.createComment('['), row);
			row.parentNode!.insertBefore(document.createComment(']'), row.nextSibling);
		}
		const before = container.innerHTML;

		const root = hydrateRoot(container, List, { items, onPick: () => {} });
		flushSync(() => {});

		expect(container.innerHTML).toBe(before);
		expect([...container.querySelectorAll('li.row')]).toEqual(rows);
		root.unmount();
	});

	it('adopts stateful component rows and preserves their identity through keyed updates', () => {
		const items = [
			{ id: 'a', name: 'Alpha' },
			{ id: 'b', name: 'Beta' },
			{ id: 'c', name: 'Gamma' },
		];
		const onPick = vi.fn();
		container.innerHTML = ServerRT.renderToString(server.ComponentList, { items, onPick }).html;
		const rows = new Map(
			[...container.querySelectorAll<HTMLElement>('.component-row')].map((row) => [
				row.dataset.id,
				row,
			]),
		);
		const tail = container.querySelector('.component-tail');
		const root = hydrateRoot(container, ComponentList, { items, onPick });

		try {
			expect([...container.querySelectorAll('.component-row')]).toEqual([
				rows.get('a'),
				rows.get('b'),
				rows.get('c'),
			]);
			expect(container.querySelector('.component-tail')).toBe(tail);

			const betaButton = rows.get('b')!.querySelector('button') as HTMLButtonElement;
			flushSync(() => betaButton.click());
			expect(betaButton.textContent).toBe('Beta:1');
			expect(onPick).toHaveBeenCalledExactlyOnceWith('b');

			flushSync(() =>
				root.render(ComponentList, { items: [items[2], items[1], items[0]], onPick }),
			);
			expect([...container.querySelectorAll('.component-row')]).toEqual([
				rows.get('c'),
				rows.get('b'),
				rows.get('a'),
			]);
			expect(betaButton.textContent).toBe('Beta:1');
			expect(container.querySelector('.component-tail')).toBe(tail);

			flushSync(() => root.render(ComponentList, { items: [], onPick }));
			expect(container.querySelector('.component-empty')?.textContent).toBe('No items');
			expect(container.querySelector('.component-row')).toBeNull();
			expect(container.querySelector('.component-tail')).toBe(tail);

			flushSync(() => root.render(ComponentList, { items: [items[1]], onPick }));
			const replacement = container.querySelector('.component-pick') as HTMLButtonElement;
			expect(container.querySelector('.component-empty')).toBeNull();
			expect(replacement.textContent).toBe('Beta:0');
			flushSync(() => replacement.click());
			expect(replacement.textContent).toBe('Beta:1');
			expect(onPick).toHaveBeenCalledTimes(2);
		} finally {
			root.unmount();
		}
	});

	it('adopts an initially empty component list and keeps its trailing sibling when rows appear', () => {
		const onPick = vi.fn();
		const items: Array<{ id: string; name: string }> = [];
		container.innerHTML = ServerRT.renderToString(server.ComponentList, { items, onPick }).html;
		const empty = container.querySelector('.component-empty');
		const tail = container.querySelector('.component-tail');
		const root = hydrateRoot(container, ComponentList, { items, onPick });

		try {
			expect(container.querySelector('.component-empty')).toBe(empty);
			expect(container.querySelector('.component-tail')).toBe(tail);

			flushSync(() => root.render(ComponentList, { items: [{ id: 'new', name: 'New' }], onPick }));
			const button = container.querySelector('.component-pick') as HTMLButtonElement;
			expect(container.querySelector('.component-empty')).toBeNull();
			expect(button.textContent).toBe('New:0');
			expect(container.querySelector('.component-tail')).toBe(tail);
			flushSync(() => button.click());
			expect(onPick).toHaveBeenCalledExactlyOnceWith('new');
		} finally {
			root.unmount();
		}
	});

	it('preserves explicitly keyed component boundaries while adopting and reordering rows', () => {
		const items = [
			{ id: 'a', name: 'Alpha' },
			{ id: 'b', name: 'Beta' },
		];
		const onPick = vi.fn();
		container.innerHTML = ServerRT.renderToString(server.ExplicitKeyComponentList, {
			items,
			onPick,
		}).html;
		const rows = [...container.querySelectorAll<HTMLElement>('.component-row')];
		const root = hydrateRoot(container, ExplicitKeyComponentList, { items, onPick });

		try {
			expect([...container.querySelectorAll('.component-row')]).toEqual(rows);
			const betaButton = rows[1].querySelector('button') as HTMLButtonElement;
			flushSync(() => betaButton.click());
			flushSync(() => root.render(ExplicitKeyComponentList, { items: items.toReversed(), onPick }));
			expect([...container.querySelectorAll('.component-row')]).toEqual(rows.toReversed());
			expect(betaButton.textContent).toBe('Beta:1');
			expect(onPick).toHaveBeenCalledExactlyOnceWith('b');
		} finally {
			root.unmount();
		}
	});

	it('adopts stateful component rows when both server and client use production compilation', () => {
		const source = readFileSync(FIXTURE, 'utf8');
		const compileOptions = { hmr: false, dev: false };
		const serverModule = loadCompiledFixtureSource<typeof import('./_fixtures/forlist.tsrx')>(
			source,
			{ id: 'forlist-production.tsrx', mode: 'server', compileOptions },
		);
		const clientModule = loadCompiledFixtureSource<typeof import('./_fixtures/forlist.tsrx')>(
			source,
			{ id: 'forlist-production.tsrx', mode: 'client', compileOptions },
		);
		const onPick = vi.fn();
		const items = [
			{ id: 'a', name: 'Alpha' },
			{ id: 'b', name: 'Beta' },
		];
		container.innerHTML = ServerRT.renderToString(serverModule.ComponentList, {
			items,
			onPick,
		}).html;
		const rows = [...container.querySelectorAll<HTMLElement>('.component-row')];
		const root = hydrateRoot(container, clientModule.ComponentList, { items, onPick });

		try {
			expect([...container.querySelectorAll('.component-row')]).toEqual(rows);
			const button = rows[1].querySelector('button') as HTMLButtonElement;
			flushSync(() => button.click());
			flushSync(() =>
				root.render(clientModule.ComponentList, { items: items.toReversed(), onPick }),
			);
			expect([...container.querySelectorAll('.component-row')]).toEqual(rows.toReversed());
			expect(button.textContent).toBe('Beta:1');
			expect(onPick).toHaveBeenCalledExactlyOnceWith('b');
		} finally {
			root.unmount();
		}
	});
});
