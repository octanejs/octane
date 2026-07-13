// Request-scoped SERVER routers. octane's prerender() calls the App component
// synchronously, but @octanejs/tanstack-router resolves its match tree through
// async `router.load()`, so middleware prepares one router in Context.state
// before rendering. App reads that same entry synchronously; an unwarmed render
// may start it itself and suspend on its promise.
//
// Loaded routers must never live in a module-global pathname cache: route
// loaders/context can contain request or user data. Context.state belongs to
// one middleware request, so identical URLs still receive distinct routers.
import { createMemoryHistory } from '@octanejs/tanstack-router';
import { makeRouter } from './router.ts';

export interface ServerRouterEntry {
	url: string;
	router: any;
	promise: Promise<void>;
	done: boolean;
}

export const SERVER_ROUTER_STATE_KEY = 'octane.website.server-router';

export function normalizeRequestUrl(requestUrl: string): string {
	const url = new URL(requestUrl, 'http://octane.invalid');
	let pathname = url.pathname;
	if (!pathname.startsWith('/')) pathname = '/' + pathname;
	if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
	return pathname + url.search;
}

function createServerRouterEntry(requestUrl: string): ServerRouterEntry {
	const url = normalizeRequestUrl(requestUrl);
	const history = createMemoryHistory({ initialEntries: [url] });
	const router = makeRouter({ history, isServer: true });
	const entry: ServerRouterEntry = { url, router, done: false, promise: Promise.resolve() };
	entry.promise = router.load().then(() => {
		entry.done = true;
	});
	return entry;
}

export function getServerRouterEntry(
	state: Map<string, unknown>,
	requestUrl: string,
): ServerRouterEntry {
	const url = normalizeRequestUrl(requestUrl);
	const existing = state.get(SERVER_ROUTER_STATE_KEY);
	if (existing && (existing as ServerRouterEntry).url === url) {
		return existing as ServerRouterEntry;
	}
	const entry = createServerRouterEntry(url);
	state.set(SERVER_ROUTER_STATE_KEY, entry);
	return entry;
}

/** Prepare this request's router before the synchronous SSR shell pass. */
export async function warmServerRouter(
	state: Map<string, unknown>,
	requestUrl: string,
): Promise<void> {
	await getServerRouterEntry(state, requestUrl).promise;
}
