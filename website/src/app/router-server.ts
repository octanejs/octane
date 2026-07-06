// Per-URL SERVER routers. octane's prerender() calls the App component
// synchronously, but @octanejs/router resolves its match tree through the async
// `router.load()` — so the loaded router has to exist BEFORE the component
// render reaches <RouterProvider/>. Two cooperating paths:
//
//  1. The octane.config.ts `before` middleware calls `warmServerRouter(url)`
//     per request, so by render time the entry is `done` and App reads the
//     loaded router synchronously (the normal dev-SSR path).
//  2. If a render arrives unwarmed (e.g. a direct `prerender(App, …)` outside
//     the plugin), App falls back to `use(entry.promise)` inside a @try
//     boundary — prerender awaits it and re-renders.
//
// Routers are cached per normalized pathname: this site's routes are static
// (no loaders, no per-request data), so reusing a loaded router across
// requests for the same URL is sound.
import { createMemoryHistory } from '@octanejs/router';
import { makeRouter } from './router.ts';

export interface ServerRouterEntry {
	router: any;
	promise: Promise<void>;
	done: boolean;
}

const cache = new Map<string, ServerRouterEntry>();
const MAX_CACHED = 200; // dev-server safety valve; entries are tiny

export function normalizePathname(pathname: string): string {
	if (!pathname.startsWith('/')) pathname = '/' + pathname;
	// Strip a trailing slash (except the root) so '/docs/' and '/docs' share an entry.
	if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
	return pathname;
}

export function getServerRouterEntry(pathname: string): ServerRouterEntry {
	const key = normalizePathname(pathname);
	let entry = cache.get(key);
	if (!entry) {
		if (cache.size >= MAX_CACHED) cache.clear();
		const history = createMemoryHistory({ initialEntries: [key] });
		const router = makeRouter({ history, isServer: true });
		const created: ServerRouterEntry = { router, done: false, promise: Promise.resolve() };
		created.promise = router.load().then(() => {
			created.done = true;
		});
		cache.set(key, created);
		entry = created;
	}
	return entry;
}

/** Load (or reuse) the server router for `pathname`; resolves when matches are ready. */
export async function warmServerRouter(pathname: string): Promise<void> {
	await getServerRouterEntry(pathname).promise;
}
