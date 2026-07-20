import {
	createRouter,
	defaultParseSearch,
	defaultStringifySearch,
	type RouterHistory,
} from '@octanejs/tanstack-router';
import { routeTree } from './routeTree.gen.ts';
import './app/stale-chunk-reload.ts';

type WebsiteSearch = Record<string, unknown>;

// Error decoder arguments are opaque diagnostic text. TanStack Router's default
// codec JSON-parses values such as `null`, `true`, and `"quoted"`. Preserve only
// repeated `args[]` values as text; all other website search parameters retain
// the router's normal JSON-compatible semantics.
export function parseWebsiteSearch(search: string): WebsiteSearch {
	const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
	const parsed = defaultParseSearch(search) as WebsiteSearch;
	const arguments_ = params.getAll('args[]');
	if (arguments_.length === 1) {
		parsed['args[]'] = arguments_[0];
	} else if (arguments_.length > 1) {
		parsed['args[]'] = arguments_;
	}
	return parsed;
}

export function stringifyWebsiteSearch(search: Record<string, unknown>): string {
	const { ['args[]']: arguments_, ...rest } = search;
	const regularSearch = defaultStringifySearch(rest);
	const params = new URLSearchParams(
		regularSearch.startsWith('?') ? regularSearch.slice(1) : regularSearch,
	);
	if (Array.isArray(arguments_)) {
		for (const argument of arguments_) {
			if (argument !== undefined) params.append('args[]', String(argument));
		}
	} else if (arguments_ !== undefined) {
		params.append('args[]', String(arguments_));
	}
	const serialized = params.toString();
	return serialized ? '?' + serialized : '';
}

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
		// A route swap replaces the document's content, so its top/reset position
		// must apply immediately even though same-page anchors scroll smoothly.
		scrollRestorationBehavior: 'instant',
		defaultPreload: 'intent',
		parseSearch: parseWebsiteSearch,
		stringifySearch: stringifyWebsiteSearch,
	});
}

declare module '@octanejs/tanstack-router' {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
