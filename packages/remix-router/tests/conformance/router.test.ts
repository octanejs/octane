/**
 * @octanejs/remix-router core conformance — createMemoryRouter +
 * RouterProvider through octane's render path, against the REAL vendored core.
 * Ports behaviors from react-router's data-memory-router-test.tsx and the
 * matching-shape suites.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRouter } from '@octanejs/remix-router';
import { mount, nextPaint } from '../_helpers';
import {
	App,
	Layout,
	Home,
	About,
	UserDetail,
	Splat,
	LoaderPage,
	MatchesProbe,
	captured,
} from '../_fixtures/basic.tsrx';
import { createElement } from 'octane';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

beforeEach(() => {
	captured.navigate = undefined;
	captured.log.length = 0;
});

describe('createMemoryRouter + RouterProvider', () => {
	it('renders the first matching route via element', async () => {
		// Per data-memory-router-test.tsx "renders the first route that matches the URL".
		const router = createMemoryRouter([{ path: '/', element: createElement(Home) }]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('h1').textContent).toBe('Home');
		r.unmount();
	});

	it('renders via the Component prop variant', async () => {
		// Per data-memory-router-test.tsx "supports a `Component` prop".
		const router = createMemoryRouter([{ path: '/', Component: Home }]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('h1').textContent).toBe('Home');
		r.unmount();
	});

	it('descends through a layout route via Outlet', async () => {
		const router = createMemoryRouter([
			{
				path: '/',
				element: createElement(Layout),
				children: [{ index: true, element: createElement(Home) }],
			},
		]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('header').textContent).toBe('layout');
		expect(r.find('main h1').textContent).toBe('Home');
		r.unmount();
	});

	it('renders dynamic params and splats, decoded', async () => {
		const router = createMemoryRouter(
			[
				{ path: '/users/:id', element: createElement(UserDetail) },
				{ path: '/files/*', element: createElement(Splat) },
			],
			{ initialEntries: ['/users/caf%C3%A9'] },
		);
		const r = mount(App, { router });
		await flush();
		expect(r.find('p').textContent).toBe('User café');

		await router.navigate('/files/a/b.txt');
		await flush();
		expect(r.find('p').textContent).toBe('Splat a/b.txt');
		r.unmount();
	});

	it('respects initialEntries + initialIndex', async () => {
		const router = createMemoryRouter(
			[
				{ path: '/', element: createElement(Home) },
				{ path: '/about', element: createElement(About) },
			],
			{ initialEntries: ['/', '/about'], initialIndex: 1 },
		);
		const r = mount(App, { router });
		await flush();
		expect(r.find('h1').textContent).toBe('About');
		r.unmount();
	});

	it('runs loaders before render and exposes data via useLoaderData', async () => {
		const router = createMemoryRouter([
			{
				path: '/',
				element: createElement(LoaderPage),
				loader: () => ({ value: 'ok' }),
			},
		]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('p').textContent).toBe('data:ok');
		r.unmount();
	});

	it('mounts under a basename', async () => {
		// Per data-memory-router-test.tsx basename cases.
		const router = createMemoryRouter(
			[
				{
					path: '/',
					element: createElement(Layout),
					children: [{ path: 'about', element: createElement(About) }],
				},
			],
			{ basename: '/base', initialEntries: ['/base/about'] },
		);
		const r = mount(App, { router });
		await flush();
		expect(r.find('main h1').textContent).toBe('About');
		r.unmount();
	});

	it('exposes match ids through useMatches', async () => {
		const router = createMemoryRouter([
			{
				id: 'root',
				path: '/',
				element: createElement(Layout),
				children: [{ id: 'idx', index: true, element: createElement(MatchesProbe) }],
			},
		]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('main p').textContent).toBe('root,idx');
		r.unmount();
	});
});
