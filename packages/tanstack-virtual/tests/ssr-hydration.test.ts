import { afterEach, expect, it } from 'vitest';
import { act, drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr.js';
import { HydratedVirtualList, observerLifecycle } from './_fixtures/hydration.tsrx';

afterEach(() => document.body.replaceChildren());

// @parity-case conformance:virtual-hydration
it('adopts the initial virtual rows, updates their extent and disposes the observer', async () => {
	const { html } = await renderHydrationFixture(
		'tanstack-virtual',
		'packages/tanstack-virtual/tests/_fixtures/hydration.tsrx',
		'HydratedVirtualList',
		{},
	);
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.append(container);
	const row = container.querySelector('[data-row="0"]');
	const button = container.querySelector<HTMLButtonElement>('#grow')!;
	expect(row?.textContent).toBe('0');
	expect(container.querySelector('#extent')?.textContent).toBe('1000');
	observerLifecycle.attached = 0;
	observerLifecycle.detached = 0;
	const root = hydrateRoot(container, HydratedVirtualList, {});
	try {
		await act(async () => {});
		drainPassiveEffects();
		expect(container.querySelector('[data-row="0"]')).toBe(row);
		expect(container.querySelector('#grow')).toBe(button);
		expect(observerLifecycle).toEqual({ attached: 1, detached: 0 });
		flushSync(() => button.click());
		drainPassiveEffects();
		expect(container.querySelector('#extent')?.textContent).toBe('1050');
		expect(container.querySelector('[data-row="0"]')).toBe(row);
		expect(observerLifecycle).toEqual({ attached: 1, detached: 0 });
	} finally {
		root.unmount();
	}
	expect(observerLifecycle).toEqual({ attached: 1, detached: 1 });
});
