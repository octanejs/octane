import { createRouter } from '@octanejs/tanstack-router';
import { routeTree } from './routeTree.gen';
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary.tsrx';
import { NotFound } from './components/NotFound.tsrx';

export function getRouter() {
	return createRouter({
		routeTree,
		defaultPreload: 'intent',
		scrollRestoration: true,
		defaultStaleTime: 1,
		defaultErrorComponent: DefaultCatchBoundary,
		defaultNotFoundComponent: NotFound,
		scrollToTopSelectors: ['.scroll-to-top'],
	});
}
