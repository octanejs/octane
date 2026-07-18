import { createRouter, type RouterHistory } from '@tanstack/octane-router';
import { routeTree } from './routeTree.gen.ts';
import './app/stale-chunk-reload.ts';

export interface WebsiteRouterOptions {
	history?: RouterHistory;
	isServer?: boolean;
}

export function getRouter(options: WebsiteRouterOptions = {}) {
	return createRouter({
		routeTree,
		history: options.history,
		isServer: options.isServer,
		scrollRestoration: true,
		defaultPreload: 'intent',
	});
}

declare module '@tanstack/octane-router' {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
