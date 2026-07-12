/**
 * @octanejs/remix-router navigation conformance — useNavigate/useNavigation
 * against the REAL vendored core, through octane's render path. Ports
 * behaviors from react-router's useNavigate-test.tsx and
 * data-memory-router-test.tsx (RouterProvider variants).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRouter, redirect } from '@octanejs/remix-router';
import { mount, nextPaint } from '../_helpers';
import { App, Layout, Home, About, LoaderPage } from '../_fixtures/basic.tsrx';
import { nav, NavPage, StateProbe, StatusProbe } from '../_fixtures/probes.tsrx';
import { createElement } from 'octane';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

beforeEach(() => {
	nav.fn = undefined;
	nav.revalidator = undefined;
});

describe('useNavigate + useNavigation', () => {
	it('navigates, runs the loader, and useNavigation goes idle→loading→idle', async () => {
		// Per useNavigate-test.tsx:17 + data-memory-router-test.tsx:536.
		let resolveLoader: any;
		const loaderPromise = new Promise((r) => (resolveLoader = r));
		let loaderCalls = 0;
		const router = createMemoryRouter([
			{
				path: '/',
				element: createElement(Layout),
				children: [
					{ index: true, element: createElement(NavPage, { label: 'Home' }) },
					{
						path: 'about',
						loader: () => {
							loaderCalls++;
							return loaderPromise;
						},
						element: createElement(LoaderPage),
					},
				],
			},
		]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('header').getAttribute('data-state')).toBe('idle');
		expect(r.find('h1').textContent).toBe('Home');

		const done = nav.fn('/about');
		await flush();
		expect(r.find('header').getAttribute('data-state')).toBe('loading');
		expect(loaderCalls).toBe(1);
		// Still showing the previous page while loading.
		expect(r.find('h1').textContent).toBe('Home');

		resolveLoader({ value: 'about' });
		await done;
		await flush();
		expect(r.find('header').getAttribute('data-state')).toBe('idle');
		expect(r.find('main p').textContent).toBe('data:about');
		r.unmount();
	});

	it('navigate(-1) pops back through the memory history', async () => {
		// Per data-memory-router-test.tsx:1070 (popstate navigations).
		const router = createMemoryRouter([
			{ path: '/', element: createElement(NavPage, { label: 'Home' }) },
			{ path: '/about', element: createElement(NavPage, { label: 'About' }) },
		]);
		const r = mount(App, { router });
		await flush();

		await nav.fn('/about');
		await flush();
		expect(r.find('h1').textContent).toBe('About');

		await nav.fn(-1);
		await flush();
		expect(r.find('h1').textContent).toBe('Home');
		expect(router.state.location.pathname).toBe('/');
		r.unmount();
	});

	it('navigate with state exposes it on location.state', async () => {
		// Per useNavigate-test.tsx:689 ("adds the state to location.state").
		const router = createMemoryRouter([
			{ path: '/', element: createElement(NavPage, { label: 'Home' }) },
			{ path: '/about', element: createElement(StateProbe) },
		]);
		const r = mount(App, { router });
		await flush();

		await nav.fn('/about', { state: { from: 'home' } });
		await flush();
		expect(r.find('.state').textContent).toBe('state:{"from":"home"}');
		expect(router.state.location.state).toEqual({ from: 'home' });
		r.unmount();
	});

	it('replace:true replaces the current entry instead of pushing', async () => {
		// Per dom/data-browser-router-test.tsx replace-navigation behavior (approx).
		const router = createMemoryRouter([
			{ path: '/', element: createElement(NavPage, { label: 'Home' }) },
			{ path: '/a', element: createElement(NavPage, { label: 'A' }) },
			{ path: '/b', element: createElement(NavPage, { label: 'B' }) },
		]);
		const r = mount(App, { router });
		await flush();

		await nav.fn('/a');
		await flush();
		await nav.fn('/b', { replace: true });
		await flush();
		expect(r.find('h1').textContent).toBe('B');

		// /a was replaced by /b — going back lands on /, not /a.
		await nav.fn(-1);
		await flush();
		expect(r.find('h1').textContent).toBe('Home');
		expect(router.state.location.pathname).toBe('/');
		r.unmount();
	});

	it('resolves a relative `to` against the route hierarchy (relative=route)', async () => {
		// Per useNavigate-test.tsx:1435 ("with a relative href (relative=route)"
		// under "handled via @remix-run/router").
		const router = createMemoryRouter(
			[
				{ path: 'home', element: createElement(NavPage, { label: 'Home' }) },
				{ path: 'about', element: createElement(NavPage, { label: 'About' }) },
			],
			{ initialEntries: ['/home'] },
		);
		const r = mount(App, { router });
		await flush();

		await nav.fn('../about');
		await flush();
		expect(r.find('h1').textContent).toBe('About');
		expect(router.state.location.pathname).toBe('/about');
		r.unmount();
	});

	it('handles upward navigation from an index route', async () => {
		// Per useNavigate-test.tsx:1466 ("handles upward navigation from an index
		// routes", RouterProvider variant).
		const router = createMemoryRouter(
			[
				{
					path: 'home',
					children: [{ index: true, element: createElement(NavPage, { label: 'HomeIndex' }) }],
				},
				{ path: 'about', element: createElement(NavPage, { label: 'About' }) },
			],
			{ initialEntries: ['/home'] },
		);
		const r = mount(App, { router });
		await flush();
		expect(r.find('h1').textContent).toBe('HomeIndex');

		await nav.fn('../about');
		await flush();
		expect(r.find('h1').textContent).toBe('About');
		expect(router.state.location.pathname).toBe('/about');
		r.unmount();
	});

	it('resolves ".." against path segments with relative="path"', async () => {
		// Per useNavigate-test.tsx:1725 ("with a relative href (relative=path)",
		// RouterProvider variant).
		const router = createMemoryRouter(
			[
				{ path: 'contacts', element: createElement(NavPage, { label: 'Contacts' }) },
				{ path: 'contacts/:id', element: createElement(NavPage, { label: 'Contact' }) },
			],
			{ initialEntries: ['/contacts/1'] },
		);
		const r = mount(App, { router });
		await flush();
		expect(r.find('h1').textContent).toBe('Contact');

		await nav.fn('..', { relative: 'path' });
		await flush();
		expect(r.find('h1').textContent).toBe('Contacts');
		expect(router.state.location.pathname).toBe('/contacts');
		r.unmount();
	});

	it('loader redirect() lands on the target, including relative redirects', async () => {
		// Per data-memory-router-test.tsx:200 ("supports relative routing in
		// loader/action redirects").
		const router = createMemoryRouter([
			{ path: '/', element: createElement(Home) },
			{ path: '/redir', loader: () => redirect('/target') },
			{ path: '/target', element: createElement(About) },
			{
				path: '/parent',
				element: createElement(Layout),
				children: [
					{ index: true, element: createElement(NavPage, { label: 'ParentIndex' }) },
					{ path: 'child', loader: () => redirect('..'), element: createElement(About) },
				],
			},
		]);
		const r = mount(App, { router });
		await flush();

		await router.navigate('/redir');
		await flush();
		expect(router.state.location.pathname).toBe('/target');
		expect(r.find('h1').textContent).toBe('About');

		await router.navigate('/parent/child');
		await flush();
		expect(router.state.location.pathname).toBe('/parent');
		expect(r.find('main h1').textContent).toBe('ParentIndex');
		r.unmount();
	});

	it('navigate returns a promise that resolves once the navigation completes', async () => {
		// Per data-memory-router-test.tsx:1018 ("exposes promise from useNavigate").
		let resolveLoader: any;
		const loaderPromise = new Promise((r) => (resolveLoader = r));
		const router = createMemoryRouter([
			{ path: '/', element: createElement(NavPage, { label: 'Home' }) },
			{ path: '/slow', loader: () => loaderPromise, element: createElement(LoaderPage) },
		]);
		const r = mount(App, { router });
		await flush();

		let settled = false;
		const p = nav.fn('/slow') as Promise<void>;
		p.then(() => (settled = true));
		await flush();
		expect(settled).toBe(false);
		expect(r.find('h1').textContent).toBe('Home');

		resolveLoader({ value: 'slow' });
		await p;
		expect(settled).toBe(true);
		await flush();
		expect(r.find('p').textContent).toBe('data:slow');
		r.unmount();
	});

	it('renders the default 404 ErrorResponse for a non-matching path', async () => {
		// Per data-memory-router-test.tsx:1884 ("renders 404 errors using
		// path='/' error boundary").
		const router = createMemoryRouter([
			{
				path: '/',
				element: createElement(NavPage, { label: 'Home' }),
				errorElement: createElement(StatusProbe),
			},
		]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('h1').textContent).toBe('Home');

		await router.navigate('/not-a-route');
		await flush();
		expect(r.find('.status').textContent).toBe('404 Not Found');
		r.unmount();
	});
});
