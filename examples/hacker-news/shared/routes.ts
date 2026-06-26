// Shared route STRUCTURE. Both apps call createAppRouter with their own view
// components (the only thing that differs between the .tsx and .tsrx versions);
// the route tree, paths, and params are identical.
import { createRouter, createRootRoute, createRoute } from '@octane-ts/router';

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
		routeTree: rootRoute.addChildren([indexRoute, itemRoute, userRoute]),
	});
}
