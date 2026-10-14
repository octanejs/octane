import { expect, it } from 'vitest';
import { render, waitFor } from '@octanejs/testing-library';
import {
	RouterProvider,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	type NavigateOptions,
} from '@octanejs/tanstack-router';
import { attachRouterServerSsrUtils } from '@octanejs/tanstack-router/ssr/server';
import { SiteHeadContent } from '../src/components/SiteHeadContent.tsrx';

it('preserves the stylesheet across changing head tags, filters modulepreloads, and cleans up', async () => {
	const root = createRootRoute({ component: SiteHeadContent });
	const routeA = createRoute({
		getParentRoute: () => root,
		path: '/a',
		head: () => ({ meta: [{ name: 'site-head-route', content: 'a' }] }),
	});
	const routeB = createRoute({
		getParentRoute: () => root,
		path: '/b',
		head: () => ({
			meta: [
				{ name: 'site-head-route', content: 'b' },
				{ name: 'site-head-extra', content: 'extra' },
			],
		}),
	});
	const router = createRouter({
		routeTree: root.addChildren([routeA, routeB]),
		history: createMemoryHistory({ initialEntries: ['/a'] }),
	});
	attachRouterServerSsrUtils({
		router,
		manifest: {
			routes: {
				__root__: { css: ['/assets/site-head.css'] },
				'/a': { preloads: ['/assets/a.js'] },
				'/b': { preloads: ['/assets/b.js', '/assets/shared.js'] },
			},
		},
	});
	router.isServer = false;
	await router.load();
	const result = render(RouterProvider, { props: { router } });
	const stylesheetSelector = 'link[rel="stylesheet"][href="/assets/site-head.css"]';
	const routeSelector = 'meta[name="site-head-route"]';
	const extraSelector = 'meta[name="site-head-extra"]';
	try {
		await waitFor(() => {
			expect(document.head.querySelector(routeSelector)?.getAttribute('content')).toBe('a');
			expect(document.head.querySelector(stylesheetSelector)).not.toBeNull();
		});
		const stylesheet = document.head.querySelector(stylesheetSelector);
		expect(document.head.querySelector('link[rel="modulepreload"]')).toBeNull();

		// This fixture has a different route tree from the website's registered router.
		const navigate = router.navigate as (
			options: NavigateOptions<typeof router, string, '/b'>,
		) => Promise<void>;
		await navigate({ to: '/b' });

		await waitFor(() => {
			expect(document.head.querySelector(routeSelector)?.getAttribute('content')).toBe('b');
			expect(document.head.querySelector(extraSelector)).not.toBeNull();
		});
		expect(document.head.querySelector(stylesheetSelector)).toBe(stylesheet);
		expect(stylesheet?.isConnected).toBe(true);
		expect(document.head.querySelector('link[rel="modulepreload"]')).toBeNull();
	} finally {
		result.unmount();
		router.serverSsr?.cleanup();
	}
	expect(document.head.querySelector(stylesheetSelector)).toBeNull();
	expect(document.head.querySelector(routeSelector)).toBeNull();
	expect(document.head.querySelector(extraSelector)).toBeNull();
});
