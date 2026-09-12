import { afterEach, describe, expect, it } from 'vitest';
import { hydrateRoot, flushSync, drainPassiveEffects } from 'octane';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr.js';
import { AsyncCallbackParity } from './_fixtures/pacer-diff.tsrx';

afterEach(() => document.body.replaceChildren());

describe('Pacer async callbacks across SSR and hydration', () => {
	// @parity-case conformance:pacer-hydration
	it('adopts server output and keeps disabled callbacks interactive', async () => {
		const { html } = await renderHydrationFixture(
			'tanstack-pacer',
			'packages/tanstack-pacer/tests/_fixtures/pacer-diff.tsrx',
			'AsyncCallbackParity',
			{},
		);
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.append(container);
		const output = container.querySelector('#async-results');
		const button = container.querySelector('#async-debounce');
		expect(output?.textContent).toBe('');
		const root = hydrateRoot(container, AsyncCallbackParity, {});
		try {
			drainPassiveEffects();
			expect(container.querySelector('#async-results')).toBe(output);
			expect(container.querySelector('#async-debounce')).toBe(button);
			flushSync(() => container.querySelector<HTMLButtonElement>('#async-disable')!.click());
			drainPassiveEffects();
			flushSync(() => container.querySelector<HTMLButtonElement>('#async-debounce')!.click());
			await Promise.resolve();
			flushSync(() => {});
			expect(output?.textContent).toBe('debounce:undefined');
		} finally {
			root.unmount();
		}
	});
});
