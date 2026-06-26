// Shared route STRUCTURE. Both apps call createAppRouter with their own view
// components (the only thing that differs between the .tsx and .tsrx versions);
// the route tree, paths, and params are identical.
import { createRouter, createRootRoute, createRoute } from '@octane-ts/router';
import type { Feed } from './api.js';

// The internal feed routes, paired with their HN feed. Home ('/') is the top
// feed; the rest are siblings that render the SAME StoriesPage. A StoriesPage
// derives its feed from the active pathname via `feedForPath` below.
export const FEED_ROUTES: { path: string; feed: Feed }[] = [
	{ path: '/', feed: 'top' },
	{ path: '/newest', feed: 'new' },
	{ path: '/ask', feed: 'ask' },
	{ path: '/show', feed: 'show' },
	{ path: '/jobs', feed: 'jobs' },
];

/** Map an active pathname to its feed; unknown paths fall back to 'top'. */
export function feedForPath(pathname: string): Feed {
	const match = FEED_ROUTES.find((r) => r.path === pathname);
	return match ? match.feed : 'top';
}

export interface AppComponents {
	RootLayout: any;
	StoriesPage: any;
	ItemPage: any;
	UserPage: any;
	NotFound?: any;
	// Per-route Suspense fallbacks (skeletons). A route component that calls
	// `useSuspenseQuery` suspends to its `pendingComponent` (the router's <Match>
	// wraps each route in a @try/@pending boundary).
	StoriesPending?: any;
	ItemPending?: any;
	UserPending?: any;
}

export function createAppRouter(components: AppComponents) {
	const {
		RootLayout,
		StoriesPage,
		ItemPage,
		UserPage,
		NotFound,
		StoriesPending,
		ItemPending,
		UserPending,
	} = components;

	const rootRoute = createRootRoute({
		component: RootLayout,
		notFoundComponent: NotFound,
	});

	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: StoriesPage,
		pendingComponent: StoriesPending,
	});

	// Sibling feed routes — same StoriesPage, which reads its feed from the
	// active pathname (see `feedForPath`). Paths mirror FEED_ROUTES (minus '/').
	const feedRoutes = ['newest', 'ask', 'show', 'jobs'].map((path) =>
		createRoute({
			getParentRoute: () => rootRoute,
			path,
			component: StoriesPage,
			pendingComponent: StoriesPending,
		}),
	);

	const itemRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'item/$id',
		component: ItemPage,
		pendingComponent: ItemPending,
	});

	const userRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'user/$id',
		component: UserPage,
		pendingComponent: UserPending,
	});

	return createRouter({
		routeTree: rootRoute.addChildren([indexRoute, ...feedRoutes, itemRoute, userRoute]),
	});
}
