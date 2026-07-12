/**
 * @octanejs/remix-router <Link> conformance — href resolution and click
 * interception against the REAL vendored core, through octane's render path
 * (native delegated click events; Link preventDefaults SPA-eligible clicks).
 * Ports behaviors from react-router's dom/link-href-test.tsx and
 * dom/link-click-test.tsx.
 */
import { describe, it, expect } from 'vitest';
import { createMemoryRouter } from '@octanejs/remix-router';
import { mount, nextPaint } from '../_helpers';
import { App, About } from '../_fixtures/basic.tsrx';
import { LinksPage, BasenameLinkPage, ClickLinksPage } from '../_fixtures/links.tsrx';
import { createElement } from 'octane';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('<Link>', () => {
	it('renders route-relative, upward-relative, and search/hash hrefs', async () => {
		// Per dom/link-href-test.tsx (relative + search/hash href resolution, approx :40).
		const router = createMemoryRouter(
			[
				{
					path: '/parent',
					children: [{ path: 'current', element: createElement(LinksPage) }],
				},
			],
			{ initialEntries: ['/parent/current'] },
		);
		const r = mount(App, { router });
		await flush();
		expect(r.find('#rel').getAttribute('href')).toBe('/parent/current/child');
		// Route-relative "..": up one ROUTE level (to /parent), then "sibling".
		expect(r.find('#up').getAttribute('href')).toBe('/parent/sibling');
		expect(r.find('#qs').getAttribute('href')).toBe('/about?x=1#top');
		r.unmount();
	});

	it('prepends the basename to rendered hrefs', async () => {
		// Per dom/link-href-test.tsx basename cases (approx :700).
		const router = createMemoryRouter([{ path: '/', element: createElement(BasenameLinkPage) }], {
			basename: '/app',
			initialEntries: ['/app'],
		});
		const r = mount(App, { router });
		await flush();
		expect(r.find('#base').getAttribute('href')).toBe('/app/about');
		r.unmount();
	});

	it('clicking a Link prevents the default and navigates the router', async () => {
		// Per dom/link-click-test.tsx ("navigates when clicked", approx :20).
		const router = createMemoryRouter([
			{ path: '/', element: createElement(ClickLinksPage) },
			{ path: '/about', element: createElement(About) },
		]);
		const r = mount(App, { router });
		await flush();

		const anchor = r.find('#spa');
		const event = new MouseEvent('click', { bubbles: true, cancelable: true });
		anchor.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		await flush();
		expect(router.state.location.pathname).toBe('/about');
		expect(r.find('h1').textContent).toBe('About');
		r.unmount();
	});

	it('reloadDocument opts out of interception — the router does not navigate', async () => {
		// Per dom/link-click-test.tsx reloadDocument passthrough (approx :80).
		const router = createMemoryRouter([
			{ path: '/', element: createElement(ClickLinksPage) },
			{ path: '/about', element: createElement(About) },
		]);
		const r = mount(App, { router });
		await flush();

		const anchor = r.find('#reload');
		const event = new MouseEvent('click', { bubbles: true, cancelable: true });
		anchor.dispatchEvent(event);
		// Link left the event alone — the document (not the router) handles it.
		expect(event.defaultPrevented).toBe(false);
		await flush();
		expect(router.state.location.pathname).toBe('/');
		r.unmount();
	});

	it('modified clicks (metaKey) pass through to the browser untouched', async () => {
		// Per dom/useLinkClickHandler-test.tsx / shouldProcessLinkClick modified-
		// click semantics (approx :60).
		const router = createMemoryRouter([
			{ path: '/', element: createElement(ClickLinksPage) },
			{ path: '/about', element: createElement(About) },
		]);
		const r = mount(App, { router });
		await flush();

		const anchor = r.find('#meta');
		const event = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
		anchor.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		await flush();
		expect(router.state.location.pathname).toBe('/');
		r.unmount();
	});
});
