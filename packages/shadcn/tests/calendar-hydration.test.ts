import { act, hydrateRoot, type Root } from 'octane';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { RenderResult } from '../../octane/src/runtime.server';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import { CalendarSingleFixture } from './_fixtures/calendar-app.tsrx';

// A month grid is 35 cells, each with an effect-bearing day button, so adoption
// is the interesting case: a mismatch here would silently rebuild the grid.
let server: RenderResult;
beforeAll(async () => {
	server = await renderHydrationFixture(
		'base-ui',
		'packages/shadcn/tests/_fixtures/calendar-app.tsrx',
		'CalendarSingleFixture',
	);
}, 60_000);

describe('@octanejs/shadcn — Calendar hydration', () => {
	it('adopts the server-rendered month grid and stays interactive', async () => {
		const container = document.createElement('div');
		container.innerHTML = server.html;
		document.body.appendChild(container);
		const day = container.querySelector('[role="gridcell"][data-day="2024-01-15"] button');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: Root | undefined;
		try {
			expect(day).not.toBeNull();
			await act(async () => {
				root = hydrateRoot(container, CalendarSingleFixture);
			});
			// Same node, not a replacement: hydration adopted the server's grid.
			expect(container.querySelector('[role="gridcell"][data-day="2024-01-15"] button')).toBe(day);
			expect(container.querySelector('[data-testid="selected"]')?.textContent).toBe('none');

			await act(async () => {
				(day as HTMLButtonElement).click();
			});

			// The hoisted `components` overrides keep the day button's component type stable, so
			// selecting updates the adopted node instead of replacing the grid.
			expect(container.querySelector('[role="gridcell"][data-day="2024-01-15"] button')).toBe(day);
			expect(day!.getAttribute('data-selected-single')).toBe('true');
			expect(container.querySelector('[data-testid="selected"]')?.textContent).toBe('2024-01-15');
			expect(errors).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
			errors.mockRestore();
			container.remove();
		}
	});
});
