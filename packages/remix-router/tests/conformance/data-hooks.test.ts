/**
 * @octanejs/remix-router data-hook conformance — useLoaderData /
 * useRouteLoaderData / useActionData / useRevalidator / useLocation /
 * useNavigationType / useResolvedPath / useHref against the REAL vendored
 * core, through octane's render path. Ports behaviors from react-router's
 * data-memory-router-test.tsx and the per-hook suites.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRouter } from '@octanejs/remix-router';
import { mount, nextPaint } from '../_helpers';
import { App, Layout, Home, LoaderPage, LocationProbe } from '../_fixtures/basic.tsrx';
import {
	nav,
	NavPage,
	RouteLoaderDataProbe,
	ActionProbe,
	RevalidatorPage,
	NavTypeProbe,
	PathHrefProbe,
	NavigationStateProbe,
} from '../_fixtures/probes.tsrx';
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

describe('data hooks', () => {
	it('useLoaderData exposes the loader value once the navigation settles', async () => {
		// Per data-memory-router-test.tsx:536 ("executes route loaders on navigation").
		let resolveLoader: any;
		const loaderPromise = new Promise((r) => (resolveLoader = r));
		const router = createMemoryRouter([
			{ path: '/', element: createElement(Home) },
			{ path: '/data', loader: () => loaderPromise, element: createElement(LoaderPage) },
		]);
		const r = mount(App, { router });
		await flush();

		const done = router.navigate('/data');
		await flush();
		expect(r.find('h1').textContent).toBe('Home');

		resolveLoader({ value: 'loaded' });
		await done;
		await flush();
		expect(r.find('p').textContent).toBe('data:loaded');
		r.unmount();
	});

	it('useRouteLoaderData reads a parent route loader value from a child', async () => {
		// Per data-memory-router-test.tsx:834 ("provides useRouteLoaderData").
		const router = createMemoryRouter([
			{
				id: 'parent',
				path: '/',
				loader: () => ({ who: 'parent' }),
				element: createElement(Layout),
				children: [
					{
						id: 'child',
						index: true,
						element: createElement(RouteLoaderDataProbe, { routeId: 'parent' }),
					},
				],
			},
		]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('.rld').textContent).toBe('rld:{"who":"parent"}');
		r.unmount();
	});

	it('useRouteLoaderData returns undefined for a route with no loader', async () => {
		// Per data-memory-router-test.tsx:834 (routes without loaders yield undefined).
		const router = createMemoryRouter([
			{
				id: 'parent',
				path: '/',
				loader: () => ({ who: 'parent' }),
				element: createElement(Layout),
				children: [
					{
						id: 'child',
						index: true,
						element: createElement(RouteLoaderDataProbe, { routeId: 'child' }),
					},
				],
			},
		]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('.rld').textContent).toBe('rld:undefined');
		r.unmount();
	});

	it('useActionData starts undefined, useNavigation submits, then action data lands', async () => {
		// Per data-memory-router-test.tsx:626 ("executes route actions/loaders on
		// submission navigations").
		let resolveAction: any;
		const actionPromise = new Promise((r) => (resolveAction = r));
		const router = createMemoryRouter([
			{
				path: '/',
				element: createElement(Layout),
				children: [
					{
						index: true,
						element: createElement(ActionProbe),
						action: () => actionPromise,
					},
				],
			},
		]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('.action').textContent).toBe('action:none');
		expect(r.find('header').getAttribute('data-state')).toBe('idle');

		const formData = new FormData();
		formData.append('gosh', 'dang');
		// `?index` targets the index route's action (a bare "/" would target the
		// parent route, which has none — upstream Form-to-index semantics).
		const done = router.navigate('/?index', { formMethod: 'post', formData });
		await flush();
		expect(r.find('header').getAttribute('data-state')).toBe('submitting');
		expect(r.find('.action').textContent).toBe('action:none');

		resolveAction({ msg: 'hello' });
		await done;
		await flush();
		expect(r.find('header').getAttribute('data-state')).toBe('idle');
		expect(r.find('.action').textContent).toBe('action:hello');
		r.unmount();
	});

	it('useRevalidator re-runs loaders and transitions idle→loading→idle', async () => {
		// Per use-revalidator-test.tsx:15 (revalidate + state transitions).
		let loaderCalls = 0;
		let resolveSecond: any;
		const router = createMemoryRouter([
			{
				path: '/',
				loader: () => {
					loaderCalls++;
					if (loaderCalls === 1) return { n: 1 };
					return new Promise((r) => (resolveSecond = r));
				},
				element: createElement(RevalidatorPage),
			},
		]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('.reval').textContent).toBe('n:1:idle');

		const p = nav.revalidator.revalidate();
		await flush();
		expect(loaderCalls).toBe(2);
		expect(r.find('.reval').textContent).toBe('n:1:loading');

		resolveSecond({ n: 2 });
		await p;
		await flush();
		expect(r.find('.reval').textContent).toBe('n:2:idle');
		r.unmount();
	});

	it('useLocation exposes pathname, search, and hash', async () => {
		// Per useLocation-test.tsx:12 ("returns the current location object").
		const router = createMemoryRouter([
			{ path: '/', element: createElement(Home) },
			{ path: '/about', element: createElement(LocationProbe) },
		]);
		const r = mount(App, { router });
		await flush();

		await router.navigate('/about?the=search#the-hash');
		await flush();
		expect(r.find('p').textContent).toBe('/about?the=search#the-hash');
		r.unmount();
	});

	it('useNavigationType reflects POP / PUSH / REPLACE', async () => {
		// Per lib/hooks.tsx useNavigationType (POP/PUSH/REPLACE Action semantics;
		// no dedicated upstream test file).
		const router = createMemoryRouter([
			{ path: '/', element: createElement(NavTypeProbe) },
			{ path: '/a', element: createElement(NavTypeProbe) },
			{ path: '/b', element: createElement(NavTypeProbe) },
		]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('.navtype').textContent).toBe('t:POP');

		await router.navigate('/a');
		await flush();
		expect(r.find('.navtype').textContent).toBe('t:PUSH');

		await router.navigate('/b', { replace: true });
		await flush();
		expect(r.find('.navtype').textContent).toBe('t:REPLACE');

		await router.navigate(-1);
		await flush();
		expect(r.find('.navtype').textContent).toBe('t:POP');
		r.unmount();
	});

	it('useResolvedPath resolves route-relative paths; useHref prepends the basename', async () => {
		// Per useResolvedPath-test.tsx:14 + useHref-basename-test.tsx:18.
		const router = createMemoryRouter(
			[
				{
					path: '/',
					element: createElement(Layout),
					children: [
						{
							path: 'stuff',
							element: createElement(PathHrefProbe, { to: '../about?q=1#h' }),
						},
					],
				},
			],
			{ basename: '/base', initialEntries: ['/base/stuff'] },
		);
		const r = mount(App, { router });
		await flush();
		// Route-relative: ".." from the `stuff` route resolves against "/".
		expect(r.find('.rp').textContent).toBe('/about|?q=1|#h');
		// useHref layers the basename on top of the resolved path.
		expect(r.find('.href').textContent).toBe('href:/base/about?q=1#h');
		r.unmount();
	});

	it('throws when hooks are used outside a router / data router', async () => {
		// Per lib/hooks.tsx invariants (useLocation router-context invariant;
		// getDataRouterConsoleError for the data-router hooks).
		expect(() => mount(LocationProbe as any)).toThrow(
			'useLocation() may be used only in the context of a <Router> component',
		);
		expect(() => mount(NavigationStateProbe as any)).toThrow(
			'useNavigation must be used within a data router',
		);
	});
});
