import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import * as ClientRT from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import { AutoMemoOutputHydrationApp } from './_fixtures/auto-memo-output.tsrx';

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/auto-memo-output.tsrx',
);

type Item = { id: number; label: string };
type AppProps = { items: Item[]; tick: number; theme: string };

const server = loadServerFixture(FIXTURE, {
	compileOptions: { hmr: false, dev: false },
	modules: {
		'./auto-memo-output-helper': {
			buildHydrationRows(items: Item[], Row: unknown) {
				return items.map((item) =>
					ServerRT.createElement(Row as any, {
						key: item.id,
						id: item.id,
						label: item.label,
					}),
				);
			},
		},
	},
});

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

function values(): string[] {
	return [...container.querySelectorAll('.hydration-output-value')].map(
		(node) => node.textContent ?? '',
	);
}

describe('hydration — imported keyed render output', () => {
	it('adopts server rows and preserves their state across parent, item, and context updates', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const items: Item[] = [
				{ id: 1, label: 'a' },
				{ id: 2, label: 'b' },
			];
			const initial: AppProps = { items, tick: 0, theme: 't0' };
			container.innerHTML = ServerRT.renderToString(
				server.AutoMemoOutputHydrationApp,
				initial,
			).html;
			const serverRows = [...container.querySelectorAll('.hydration-output-row')];
			const serverButton = container.querySelector('.hydration-output-own-1');

			const root = ClientRT.hydrateRoot(container, AutoMemoOutputHydrationApp, initial);
			ClientRT.flushSync(() => {});

			expect([...container.querySelectorAll('.hydration-output-row')]).toEqual(serverRows);
			expect(container.querySelector('.hydration-output-own-1')).toBe(serverButton);
			expect(values()).toEqual(['t0:a:0', 't0:b:0']);

			ClientRT.flushSync(() => (serverButton as HTMLButtonElement).click());
			expect(values()).toEqual(['t0:a:1', 't0:b:0']);

			ClientRT.flushSync(() => root.render(AutoMemoOutputHydrationApp, { ...initial, tick: 1 }));
			expect([...container.querySelectorAll('.hydration-output-row')]).toEqual(serverRows);
			expect(values()).toEqual(['t0:a:1', 't0:b:0']);

			const changedItems = [{ id: 1, label: 'a!' }, items[1]];
			ClientRT.flushSync(() =>
				root.render(AutoMemoOutputHydrationApp, {
					items: changedItems,
					tick: 1,
					theme: 't0',
				}),
			);
			expect([...container.querySelectorAll('.hydration-output-row')]).toEqual(serverRows);
			expect(values()).toEqual(['t0:a!:1', 't0:b:0']);

			ClientRT.flushSync(() =>
				root.render(AutoMemoOutputHydrationApp, {
					items: changedItems,
					tick: 1,
					theme: 't0!',
				}),
			);
			expect([...container.querySelectorAll('.hydration-output-row')]).toEqual(serverRows);
			expect(values()).toEqual(['t0!:a!:1', 't0!:b:0']);

			ClientRT.flushSync(() =>
				root.render(AutoMemoOutputHydrationApp, {
					items: [],
					tick: 1,
					theme: 't0!',
				}),
			);
			expect(container.querySelectorAll('.hydration-output-row')).toHaveLength(0);
			expect(
				errSpy.mock.calls.find((call) => String(call[0]).includes('hydration mismatch')),
			).toBeUndefined();

			root.unmount();
		} finally {
			errSpy.mockRestore();
		}
	});
});
