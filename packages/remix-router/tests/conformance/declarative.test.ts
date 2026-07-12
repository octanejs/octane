/**
 * Declarative mode (Phase B) — <Routes>/<Route> in BOTH children forms
 * (descriptor children via createRoutesFromElements, and the natural .tsrx
 * block-children form through the registration collector), MemoryRouter,
 * <Navigate>, and the documented registration-ordering caveat.
 */
import { describe, it, expect } from 'vitest';
import { createRoutesFromElements, Route } from '@octanejs/remix-router';
import { mount, nextPaint } from '../_helpers';
import { DeclarativeApp, NavigateApp, ConditionalApp } from '../_fixtures/declarative.tsrx';
import { createElement } from 'octane';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('<Routes> block children (registration collector)', () => {
	it('matches the index route inside a layout on first paint', async () => {
		// Per useRoutes-test.tsx "returns the matching element from a route config".
		const r = mount(DeclarativeApp, {});
		await flush();
		expect(r.find('header, nav')).toBeTruthy();
		expect(r.find('main h1').textContent).toBe('Home');
		r.unmount();
	});

	it('matches nested pathless/param/splat routes', async () => {
		const r = mount(DeclarativeApp, { initial: '/users/7' });
		await flush();
		expect(r.find('main p').textContent).toBe('User 7');
		r.unmount();

		const r2 = mount(DeclarativeApp, { initial: '/files/a/b.txt' });
		await flush();
		expect(r2.find('main p').textContent).toBe('Splat a/b.txt');
		r2.unmount();
	});

	it('navigates between block-declared routes via Link clicks', async () => {
		const r = mount(DeclarativeApp, {});
		await flush();

		r.click('.nav-about');
		await flush();
		expect(r.find('main h1').textContent).toBe('About');

		r.click('.nav-user');
		await flush();
		expect(r.find('main p').textContent).toBe('User 7');

		r.click('.nav-home');
		await flush();
		expect(r.find('main h1').textContent).toBe('Home');
		r.unmount();
	});

	it('a conditionally-mounted <Route> participates in matching once rendered (ordering caveat pinned)', async () => {
		// Registration order is MOUNT order: the late route registers after the
		// static siblings. That only affects matchRoutes score TIES — /extra
		// matches uniquely here, so behavior is correct regardless (documented
		// divergence in status.json).
		const r = mount(ConditionalApp, {});
		await flush();
		expect(r.find('.nf').textContent).toBe('not found'); // /extra not declared yet

		r.click('#add-route');
		await flush();
		expect(r.find('h1').textContent).toBe('Extra');
		r.unmount();
	});
});

describe('<Navigate>', () => {
	it('redirects declaratively on mount', async () => {
		// Per navigate-test.tsx "navigates to the new location".
		const r = mount(NavigateApp, {});
		await flush();
		expect(r.find('h1').textContent).toBe('New');
		r.unmount();
	});
});

describe('createRoutesFromElements (descriptor children)', () => {
	it('builds a route config from value-position <Route> descriptors', () => {
		// Per data-memory-router-test.tsx createRoutesFromElements usage.
		function Comp() {
			return null;
		}
		const routes = createRoutesFromElements(
			createElement(Route as any, {
				path: '/',
				element: createElement(Comp),
				children: [
					createElement(Route as any, { index: true, element: createElement(Comp) }),
					createElement(Route as any, { path: 'a/:id', element: createElement(Comp) }),
				],
			}),
		);
		expect(routes).toHaveLength(1);
		expect(routes[0].path).toBe('/');
		expect(routes[0].children).toHaveLength(2);
		expect(routes[0].children![0].index).toBe(true);
		expect(routes[0].children![1].path).toBe('a/:id');
		expect(routes[0].id).toBe('0');
		expect(routes[0].children![1].id).toBe('0-1');
	});

	it('rejects non-Route children', () => {
		function NotARoute() {
			return null;
		}
		expect(() => createRoutesFromElements(createElement(NotARoute))).toThrow(
			/is not a <Route> component/,
		);
	});
});
