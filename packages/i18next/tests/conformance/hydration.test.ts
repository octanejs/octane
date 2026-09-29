import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInstance } from 'i18next';
import { flushSync, hydrateRoot } from 'octane';
import { executeHydrationFixture } from '../../../octane/tests/_hydration-ssr';
import { SuspenseHydrationApp } from '../_fixtures/hydration.tsrx';

afterEach(() => {
	document.body.replaceChildren();
});

describe('@octanejs/i18next hydration', () => {
	// The server render suspends on the namespace load before it completes. The
	// load must leave no hydration seed: a client that is already ready never
	// reads it, so a stray seed would hydrate the following use() with the
	// load's value instead of its own.
	it('hydrates a use() after a useTranslation that suspended on the server', async () => {
		const serverResult = await executeHydrationFixture<{ html: string }>(
			'i18next',
			'packages/i18next/tests/ssr/_fixtures/hydration.ts',
			'renderSuspenseHydration',
		);
		const container = document.createElement('div');
		container.innerHTML = serverResult.html;
		document.body.appendChild(container);
		const serverValue = container.querySelector('#hydrated-value');
		expect(serverValue?.textContent).toBe('Lazy/server-data');

		// The client store already holds the namespace, as after useSSR, so the
		// client's useTranslation is ready on its first render.
		const i18n = createInstance();
		await i18n.init({
			lng: 'en',
			fallbackLng: false,
			ns: ['lazy'],
			resources: { en: { lazy: { key: 'Lazy' } } },
			interpolation: { escapeValue: false },
		});
		const load = vi.fn(() => Promise.resolve('client-data'));
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			root = hydrateRoot(container, SuspenseHydrationApp, { i18n, load });
			flushSync(() => {});

			expect(container.querySelector('#hydrated-value')).toBe(serverValue);
			expect(serverValue?.textContent).toBe('Lazy/server-data');
			expect(load).not.toHaveBeenCalled();
			expect(errors).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
			errors.mockRestore();
		}
	}, 15_000);
});
