import { afterEach, expect, it } from 'vitest';
import { act, drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr.js';
import { HydratedTable } from './_fixtures/hydration.tsrx';
afterEach(() => document.body.replaceChildren());
// @parity-case conformance:table-hydration
it('adopts server table rows and updates their data without remounting', async () => {
	const { html } = await renderHydrationFixture(
		'tanstack-table',
		'packages/tanstack-table/tests/_fixtures/hydration.tsrx',
		'HydratedTable',
		{},
	);
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.append(container);
	const row = container.querySelector('[data-row="1"]')!;
	const button = container.querySelector<HTMLButtonElement>('#rename')!;
	expect(row.textContent).toBe('Ada');
	const root = hydrateRoot(container, HydratedTable, {});
	try {
		await act(async () => {});
		drainPassiveEffects();
		expect(container.querySelector('[data-row="1"]')).toBe(row);
		expect(container.querySelector('#rename')).toBe(button);
		flushSync(() => button.click());
		drainPassiveEffects();
		expect(row.textContent).toBe('Grace');
		expect(container.querySelector('[data-row="1"]')).toBe(row);
		expect(container.querySelector('#rename')).toBe(button);
	} finally {
		root.unmount();
	}
	expect(row.isConnected).toBe(false);
	expect(button.isConnected).toBe(false);
});
