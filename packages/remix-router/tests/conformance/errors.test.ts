/**
 * @octanejs/remix-router error-boundary conformance — errorElement /
 * useRouteError / isRouteErrorResponse against the REAL vendored core,
 * through octane's render path. Ports behaviors from react-router's
 * data-memory-router-test.tsx errors suite.
 */
import { describe, it, expect } from 'vitest';
import { RouterProvider, createMemoryRouter } from '@octanejs/remix-router';
import { mount, nextPaint } from '../_helpers';
import { App, Layout, Home, LoaderPage, ErrorProbe } from '../_fixtures/basic.tsrx';
import { StatusProbe } from '../_fixtures/probes.tsrx';
import { createElement, useContext } from 'octane';
import { RouteErrorContext } from '../../src/lib/context';
import { RenderErrorBoundary } from '../../src/lib/RenderErrorBoundary.tsrx';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

// A route component that throws during render — plain function, any function
// is a component at an element site.
function Boom(): never {
	throw new Error('render boom');
}

describe('route error boundaries', () => {
	it('renders errorElement and exposes a thrown loader Error via useRouteError', async () => {
		// Per data-memory-router-test.tsx:1502 ("renders navigation errors on
		// leaf elements using errorElement").
		const router = createMemoryRouter([
			{ path: '/', element: createElement(Home) },
			{
				path: '/bad',
				loader: () => {
					throw new Error('broken');
				},
				element: createElement(LoaderPage),
				errorElement: createElement(ErrorProbe),
			},
		]);
		const r = mount(App, { router });
		await flush();

		await router.navigate('/bad');
		await flush();
		expect(r.find('.err').textContent).toBe('error:broken');
		r.unmount();
	});

	it('a thrown Response becomes an isRouteErrorResponse with status + data', async () => {
		// Per data-memory-router-test.tsx:1502 (thrown Responses unwrap to
		// ErrorResponses with status/data).
		const router = createMemoryRouter([
			{ path: '/', element: createElement(Home) },
			{
				path: '/bad',
				loader: () => {
					throw new Response('nope', { status: 400, statusText: 'Bad Request' });
				},
				element: createElement(LoaderPage),
				errorElement: createElement(ErrorProbe),
			},
		]);
		const r = mount(App, { router });
		await flush();

		await router.navigate('/bad');
		await flush();
		expect(r.find('.err').textContent).toBe('response:400:nope');
		r.unmount();
	});

	it("a RENDER error in a route component is caught by that route's errorElement", async () => {
		// Per data-memory-router-test.tsx:2244 ("handles render errors in child
		// errorElement").
		const router = createMemoryRouter([
			{
				path: '/',
				element: createElement(Layout),
				children: [
					{ index: true, element: createElement(Home) },
					{
						path: 'boom',
						element: createElement(Boom),
						errorElement: createElement(ErrorProbe),
					},
				],
			},
		]);
		const r = mount(App, { router });
		await flush();

		await router.navigate('/boom');
		await flush();
		// The child boundary caught it — the layout is still up.
		expect(r.find('header').textContent).toBe('layout');
		expect(r.find('main .err').textContent).toBe('error:render boom');
		r.unmount();
	});

	it('a leaf without errorElement bubbles the error to the parent errorElement', async () => {
		// Per data-memory-router-test.tsx:2206 ("handles render errors in parent
		// errorElement") / :1786 ("renders navigation errors on parent elements").
		const router = createMemoryRouter([
			{
				path: '/',
				element: createElement(Layout),
				errorElement: createElement(ErrorProbe),
				children: [
					{ index: true, element: createElement(Home) },
					{ path: 'boom', element: createElement(Boom) },
				],
			},
		]);
		const r = mount(App, { router });
		await flush();

		await router.navigate('/boom');
		await flush();
		// The parent boundary replaced the layout entirely.
		expect(r.findAll('header').length).toBe(0);
		expect(r.find('.err').textContent).toBe('error:render boom');
		r.unmount();
	});

	it('propagates an error thrown by the inner render error reporter to the parent', async () => {
		const caught = new Error('child render');
		const replacement = new Error('reporter threw');
		const reports: unknown[] = [];
		function ThrowingChild(): never {
			throw caught;
		}
		const router = createMemoryRouter([
			{
				path: '/',
				element: createElement(Layout),
				errorElement: createElement(ErrorProbe),
				children: [
					{ index: true, element: createElement(ThrowingChild), errorElement: 'inner fallback' },
				],
			},
		]);
		const r = mount(RouterProvider, {
			router,
			onError(error) {
				reports.push(error);
				if (error === caught) throw replacement;
			},
		});
		await flush();
		expect(reports).toHaveLength(2);
		expect(reports[0]).toBe(caught);
		expect(reports[1]).toBe(replacement);
		expect(r.find('.err').textContent).toBe('error:reporter threw');
		r.unmount();
	});

	it('renders a 404 ErrorResponse into the root errorElement when nothing matches', async () => {
		// Per data-memory-router-test.tsx:1884 ("renders 404 errors using
		// path='/' error boundary").
		const router = createMemoryRouter(
			[
				{
					path: '/',
					element: createElement(Home),
					errorElement: createElement(StatusProbe),
				},
			],
			{ initialEntries: ['/junk-path'] },
		);
		const r = mount(App, { router });
		await flush();
		expect(r.find('.status').textContent).toBe('404 Not Found');
		r.unmount();
	});

	it('retains the latest data error at a location until revalidation finishes or the location changes', () => {
		function ErrorValue() {
			const error = useContext(RouteErrorContext) as Error;
			return createElement('p', {}, error.message);
		}
		const props = {
			location: { pathname: '/', search: '', hash: '', state: null, key: 'first' },
			revalidation: 'idle' as const,
			error: new Error('one'),
			component: createElement(ErrorValue),
			routeContext: { outlet: null, matches: [], isDataRoute: true },
			children: 'healthy',
		};
		const r = mount(RenderErrorBoundary, props);
		r.update(RenderErrorBoundary, { ...props, error: new Error('two') });
		r.update(RenderErrorBoundary, { ...props, error: undefined });
		expect(r.find('p').textContent).toBe('two');
		r.update(RenderErrorBoundary, { ...props, revalidation: 'loading', error: undefined });
		expect(r.find('p').textContent).toBe('two');
		r.update(RenderErrorBoundary, { ...props, error: undefined });
		expect(r.container.textContent).toBe('healthy');
		r.update(RenderErrorBoundary, props);
		expect(r.find('p').textContent).toBe('one');
		r.update(RenderErrorBoundary, { ...props, location: { ...props.location }, error: undefined });
		expect(r.container.textContent).toBe('healthy');
		r.unmount();
	});

	it('a caught render error clears after a same-location revalidation (loading → idle)', async () => {
		// Per upstream getDerivedStateFromProps: derived state tracks
		// `revalidation` on EVERY render, so a render error caught while
		// revalidation is already "idle" is cleared by the NEXT revalidation
		// completing (loading → idle) — not by a transition relative to the
		// frozen catch-time value. (PR #46 review finding.)
		// Router updates are transitions, which commit in a later task (#1864), as
		// under React's Scheduler: the revalidation's loader stays pending across
		// tasks so its "loading" state commits before "idle", rather than both
		// coalescing into one render.
		let broken = true;
		let pending: Promise<object> | null = null;
		function FlakyRender() {
			if (broken) throw new Error('render flake');
			return createElement(Home);
		}
		const router = createMemoryRouter([
			{
				path: '/',
				element: createElement(Layout),
				children: [
					{
						index: true,
						element: createElement(FlakyRender),
						loader: () => pending ?? {},
						errorElement: createElement(ErrorProbe),
					},
				],
			},
		]);
		const r = mount(App, { router });
		await flush();
		expect(r.find('main .err').textContent).toBe('error:render flake');

		broken = false;
		let finish!: () => void;
		pending = new Promise((resolve) => (finish = () => resolve({})));
		const revalidated = router.revalidate();
		await flush();
		// While revalidating, the boundary keeps the error it caught.
		expect(r.find('main .err').textContent).toBe('error:render flake');
		finish();
		await revalidated;
		await flush();
		expect(r.find('main h1').textContent).toBe('Home');
		r.unmount();
	});

	it('the boundary resets when navigating away and back after the loader recovers', async () => {
		// Per data-memory-router-test.tsx:2396 ("handles back button routing away
		// from a child error boundary").
		let shouldFail = true;
		const router = createMemoryRouter([
			{
				path: '/',
				element: createElement(Layout),
				children: [
					{ index: true, element: createElement(Home) },
					{
						path: 'flaky',
						loader: () => {
							if (shouldFail) throw new Error('nope');
							return { value: 'fine' };
						},
						element: createElement(LoaderPage),
						errorElement: createElement(ErrorProbe),
					},
				],
			},
		]);
		const r = mount(App, { router });
		await flush();

		await router.navigate('/flaky');
		await flush();
		expect(r.find('main .err').textContent).toBe('error:nope');

		await router.navigate('/');
		await flush();
		expect(r.find('main h1').textContent).toBe('Home');
		expect(r.findAll('.err').length).toBe(0);

		shouldFail = false;
		await router.navigate('/flaky');
		await flush();
		expect(r.findAll('.err').length).toBe(0);
		expect(r.find('main p').textContent).toBe('data:fine');
		r.unmount();
	});
});
