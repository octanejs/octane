import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { routeTree } from './routeTree.gen';
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary';
import { NotFound } from './components/NotFound';
import { QueryClient } from '@tanstack/react-query';
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
		defaultNotFoundComponent: () => {
			return <NotFound />;
		},
		context: {
			queryClient,
		},
		scrollToTopSelectors: ['.scroll-to-top'],
	});

	setupRouterSsrQueryIntegration({ router, queryClient });

	return router;
}

declare module '@tanstack/react-router' {
	interface StaticDataRouteOption {
		baseParent?: boolean;
		Title?: () => any;
		showNavbar?: boolean;
		includeSearchInCanonical?: boolean;
	}
}

declare module '@tanstack/react-start' {
	interface Register {
		ssr: true;
		router: Awaited<ReturnType<typeof getRouter>>;
	}
}
