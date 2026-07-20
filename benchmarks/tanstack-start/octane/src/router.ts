import { createRouter } from '@tanstack/octane-router';
import { routeTree } from './routeTree.gen';
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary.tsrx';
import { NotFound } from './components/NotFound.tsrx';

export function getRouter() {
	return createRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: 'intent',
		defaultErrorComponent: DefaultCatchBoundary,
		defaultNotFoundComponent: NotFound,
	});
}
