import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import { ReactWindowServerFixture } from './ssr/_fixtures/server';
import { mockResizeObserver, setElementSizeFunction } from './utils/mockResizeObserver';

let restoreResizeObserver: (() => void) | undefined;

beforeEach(() => {
	restoreResizeObserver = mockResizeObserver();
	setElementSizeFunction((element) =>
		element.getAttribute('data-testid') === 'server-grid'
			? new DOMRect(0, 0, 40, 40)
			: new DOMRect(0, 0, 200, 100),
	);
});

afterEach(() => restoreResizeObserver?.());

describe('@octanejs/window hydration', () => {
	it('adopts server List and Grid nodes and keeps virtualization live', async () => {
		const server = await renderHydrationFixture(
			'react-window',
			'packages/window/tests/ssr/_fixtures/server.tsx',
			'ReactWindowServerFixture',
		);
		const container = document.createElement('div');
		container.innerHTML = server.html;
		document.body.appendChild(container);
		const serverMain = container.querySelector('#react-window-server');
		const serverList = container.querySelector<HTMLElement>('[data-testid="server-list"]');
		const serverGrid = container.querySelector<HTMLElement>('[data-testid="server-grid"]');
		const serverRow = serverList?.querySelector('[data-row="0"]');
		const serverCell = serverGrid?.querySelector('[data-cell="0:0"]');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			root = hydrateRoot(container, ReactWindowServerFixture);
			flushSync(() => {});
			drainPassiveEffects();

			expect(container.querySelector('#react-window-server')).toBe(serverMain);
			expect(container.querySelector('[data-testid="server-list"]')).toBe(serverList);
			expect(container.querySelector('[data-testid="server-grid"]')).toBe(serverGrid);
			expect(serverList?.querySelector('[data-row="0"]')).toBe(serverRow);
			expect(serverGrid?.querySelector('[data-cell="0:0"]')).toBe(serverCell);
			expect(errors).not.toHaveBeenCalled();

			const initialRows = serverList!.querySelectorAll('[data-row]').length;
			const initialCells = serverGrid!.querySelectorAll('[data-cell]').length;
			flushSync(() => {
				setElementSizeFunction((element) =>
					element.getAttribute('data-testid') === 'server-grid'
						? new DOMRect(0, 0, 100, 100)
						: new DOMRect(0, 0, 200, 200),
				);
			});

			expect(serverList!.querySelectorAll('[data-row]').length).toBeGreaterThan(initialRows);
			expect(serverGrid!.querySelectorAll('[data-cell]').length).toBeGreaterThan(initialCells);
			expect(serverList?.querySelector('[data-row="0"]')).toBe(serverRow);
			expect(serverGrid?.querySelector('[data-cell="0:0"]')).toBe(serverCell);
			expect(
				new Set(
					[...serverList!.querySelectorAll('[data-row]')].map((row) =>
						row.getAttribute('data-row'),
					),
				).size,
			).toBe(serverList!.querySelectorAll('[data-row]').length);
			expect(
				new Set(
					[...serverGrid!.querySelectorAll('[data-cell]')].map((cell) =>
						cell.getAttribute('data-cell'),
					),
				).size,
			).toBe(serverGrid!.querySelectorAll('[data-cell]').length);

			serverList!.scrollTop = 400;
			serverList!.dispatchEvent(new Event('scroll', { bubbles: true }));
			serverGrid!.scrollLeft = 200;
			serverGrid!.scrollTop = 200;
			serverGrid!.dispatchEvent(new Event('scroll', { bubbles: true }));
			flushSync(() => {});

			expect(serverList?.querySelector('[data-row="20"]')).not.toBeNull();
			expect(serverGrid?.querySelector('[data-cell="10:10"]')).not.toBeNull();
			expect(errors).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
			errors.mockRestore();
			container.remove();
		}
	}, 15_000);
});
