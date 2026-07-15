// The site's route tree — @octanejs/tanstack-router (TanStack Router port). One tree,
// two environments: the server builds a per-request router over a memory
// history (see router-server.ts), the client builds a singleton over the
// browser history (router-client.ts).
import { createRouter, createRootRoute, createRoute, lazyRouteComponent } from '@octanejs/tanstack-router';
import { MainLayout } from '../layouts/MainLayout.tsrx';
import { Home } from '../pages/home/Home.tsrx';

// The home route stays eager because it is the site's dominant entry point.
// Everything else is a route chunk, so landing on / does not download the
// playground/compiler, the docs corpus, or the full Visx benchmark stack.
const Benchmarks = lazyRouteComponent(() => import('../pages/benchmarks/Benchmarks.tsrx'), 'Benchmarks');
const Playground = lazyRouteComponent(() => import('../pages/playground/Playground.tsrx'), 'Playground');
const DocsLayout = lazyRouteComponent(() => import('../layouts/DocsLayout.tsrx'), 'DocsLayout');
const DocPage = lazyRouteComponent(() => import('../pages/doc-page/DocPage.tsrx'), 'DocPage');
const NotFound = lazyRouteComponent(() => import('../pages/not-found/NotFound.tsrx'), 'NotFound');


export interface RouterEnv {
	/** A history instance (memory on the server, browser default on the client). */
	history?: unknown;
	/** Force the server (non-reactive) store factory. */
	isServer?: boolean;
}

export function makeRouter(env: RouterEnv = {}): any {
	const rootRoute = createRootRoute({
		component: MainLayout,
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
