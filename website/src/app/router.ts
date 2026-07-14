// The site's route tree — @octanejs/tanstack-router (TanStack Router port). One tree,
// two environments: the server builds a per-request router over a memory
// history (see router-server.ts), the client builds a singleton over the
// browser history (router-client.ts).
import { createRouter, createRootRoute, createRoute } from '@octanejs/tanstack-router';
import { Layout } from '../components/Layout.tsrx';
import { Home } from '../pages/Home.tsrx';
import { Benchmarks } from '../pages/Benchmarks.tsrx';
import { Playground } from '../pages/Playground.tsrx';
import { DocsLayout } from '../pages/DocsLayout.tsrx';
import { DocPage } from '../pages/DocPage.tsrx';
import { NotFound } from '../pages/NotFound.tsrx';

export interface RouterEnv {
	/** A history instance (memory on the server, browser default on the client). */
	history?: unknown;
	/** Force the server (non-reactive) store factory. */
	isServer?: boolean;
}

export function makeRouter(env: RouterEnv = {}): any {
	const rootRoute = createRootRoute({
		component: Layout,
		notFoundComponent: NotFound,
	});

	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: Home,
	});

	const benchmarksRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'benchmarks',
		component: Benchmarks,
	});

	const playgroundRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'playground',
		component: Playground,
	});

	const docsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'docs',
		component: DocsLayout,
	});

	// `/docs` renders the first document (quick-start); `/docs/$slug` the rest.
	const docsIndexRoute = createRoute({
		getParentRoute: () => docsRoute,
		path: '/',
		component: DocPage,
	});

	const docsSlugRoute = createRoute({
		getParentRoute: () => docsRoute,
		path: '$slug',
		component: DocPage,
	});

	return createRouter({
		routeTree: rootRoute.addChildren([
			indexRoute,
			benchmarksRoute,
			playgroundRoute,
			docsRoute.addChildren([docsIndexRoute, docsSlugRoute]),
		]),
		history: env.history,
		isServer: env.isServer,
		scrollRestoration: true,
	});
}
