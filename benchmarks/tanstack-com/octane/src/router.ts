import { createRouter } from '@octanejs/tanstack-router';
import { setupRouterSsrQueryIntegration } from '@octanejs/tanstack-router-ssr-query';
import { routeTree } from './routeTree.gen';
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary.tsrx';
import { NotFound } from './components/NotFound.tsrx';
import { QueryClient } from '@octanejs/tanstack-query';
import { installStaleAppReloadHandlers } from './utils/stale-app-reload';

// Bench delta: Sentry init + browser-tracing integration removed
// (observability, not app behavior).
if (typeof document !== 'undefined') {
	installStaleAppReloadHandlers();
}

export function getRouter() {
	const queryClient: QueryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 1000 * 60 * 5, // 5 minutes
			},
		},
	});

	const router = createRouter({
		routeTree,
		defaultPreload: 'intent',
		defaultErrorComponent: DefaultCatchBoundary,
		scrollRestoration: true,
		defaultStaleTime: 1,
		defaultNotFoundComponent: NotFound,
		context: {
			queryClient,
		},
		scrollToTopSelectors: ['.scroll-to-top'],
	});

	setupRouterSsrQueryIntegration({ router, queryClient });

	return router;
}

declare module '@octanejs/tanstack-router' {
	interface StaticDataRouteOption {
		baseParent?: boolean;
		Title?: () => any;
		showNavbar?: boolean;
		includeSearchInCanonical?: boolean;
	}
}

declare module '@octanejs/tanstack-start' {
	interface Register {
		ssr: true;
		router: Awaited<ReturnType<typeof getRouter>>;
	}
}
