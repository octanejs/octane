/**
 * @octanejs/remix-router lazy-route + hydration-fallback conformance against
 * the REAL vendored core, through octane's render path.
 */
import { describe, it, expect } from 'vitest';
import { createMemoryRouter } from '@octanejs/remix-router';
import { mount, nextPaint } from '../_helpers';
import { App, Home, About, LoaderPage } from '../_fixtures/basic.tsrx';
import { HydrateFallback } from '../_fixtures/probes.tsrx';
import { createElement } from 'octane';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('lazy routes + hydrate fallback', () => {
	it('resolves `lazy` route properties on first navigation and renders the Component', async () => {
		// Per router/lazy-test.ts ("fetches lazy route modules on loading
		// navigation", approx :90).
		let lazyCalls = 0;
		const router = createMemoryRouter([
			{ path: '/', element: createElement(Home) },
			{
				path: '/about',
				lazy: async () => {
					lazyCalls++;
					return { Component: About };
				},
			},
		]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('h1').textContent).toBe('Home');
		expect(lazyCalls).toBe(0);

		await router.navigate('/about');
		await flush();
		expect(lazyCalls).toBe(1);
		expect(r.find('h1').textContent).toBe('About');
		r.unmount();
	});

	it('renders hydrateFallbackElement while the initial loader is pending', async () => {
		// Per data-memory-router-test.tsx:315 ("renders hydrateFallbackElement
		// while first data fetch happens").
		let resolveLoader: any;
		const loaderPromise = new Promise((r) => (resolveLoader = r));
		const router = createMemoryRouter([
			{
				path: '/',
				loader: () => loaderPromise,
				element: createElement(LoaderPage),
				hydrateFallbackElement: createElement(HydrateFallback),
			},
		]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('.fb').textContent).toBe('hydrating');
		expect(r.findAll('p').length).toBe(1);

		resolveLoader({ value: 'hydrated' });
		await flush();
		expect(r.findAll('.fb').length).toBe(0);
		expect(r.find('p').textContent).toBe('data:hydrated');
		r.unmount();
	});
});
