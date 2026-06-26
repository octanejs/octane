// Shared route STRUCTURE. Both apps call createAppRouter with their own view
// components (the only thing that differs between the .tsx and .tsrx versions);
// the route tree, paths, and params are identical.
import { createRouter, createRootRoute, createRoute, createMemoryHistory } from '@octanejs/router';
import type { Feed } from './api.js';
import { storiesQuery, pageItemsQuery, itemQuery, userQuery } from './queries.js';

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

/** The shape of a feed route's search params: a 1-based page number. */
export interface FeedSearch {
	page: number;
}

// Coerce `?page=N` into a clamped 1-based integer; anything missing/invalid is
// page 1. Passed as `validateSearch` to every feed route so `useSearch` returns a
// typed number and the URL is normalized.
export function validateFeedSearch(search: Record<string, unknown>): FeedSearch {
	const raw = Number(search.page);
	const page = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
	return { page };
}

/** Stories per page — matches HN / solid-hackernews. */
export const PAGE_SIZE = 30;

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

// How to build the router for a given environment. Server passes a memory
// history seeded with the request URL + isServer:true (non-reactive snapshot
// stores); the client passes nothing (browser history + reactive stores, the
// default). Both share the SAME route tree built below.
export interface RouterEnv {
	/** A history instance (memory on the server, browser on the client). */
	history?: any;
	/** Force the server (non-reactive) store factory + skip browser history. */
	isServer?: boolean;
	/**
	 * The per-request QueryClient. On the server it's passed as router `context` so
	 * the route loaders below can PREFETCH each route's queries into it before
	 * render() runs — render() then reads the warm cache (no in-render suspension)
	 * and dehydrate() captures the data for the client to hydrate from.
	 */
	queryClient?: any;
}

// How deep to prefetch the comment tree on the server. The view renders comments
// recursively (each its own suspending unit); we warm a bounded slice so the
// server HTML carries the top of the thread without an unbounded fan-out.
// How deep to prefetch the comment tree on the server. This MUST cover the whole
// subtree the view renders, otherwise a rendered-but-unprefetched comment suspends
// mid-render — and an SSR suspension must SETTLE (the @pending skeleton can't be
// emitted as final HTML for an unresolved thenable), so an uncached comment would
// stall render() until the timeout. The view renders top comments at depth 0 and
// recurses while `depth < MAX_DEPTH` (Comment.MAX_DEPTH = 6), so it fetches comment
// items at view-depths 0..6. Top comments sit one prefetch level below the story
// (story = level 0), so covering view-depth 6 needs MAX_DEPTH + 1 = 7 levels.
const SSR_COMMENT_PREFETCH_DEPTH = 7;

// Cap children visited per comment so a viral thread can't fan out unboundedly on
// the server. The VIEW caps its rendered kids to the SAME number (Comment uses
// `COMMENT_KIDS_LIMIT`), so the server never renders a comment it didn't prefetch
// (which would suspend mid-render and stall — see SSR_COMMENT_PREFETCH_DEPTH).
export const COMMENT_KIDS_LIMIT = 12;
const SSR_COMMENT_KIDS_CAP = COMMENT_KIDS_LIMIT;

// Prefetch `itemQuery(id)` plus, up to `depth` levels, the items of its `kids`.
// Used by the item-route loader so the server renders the item AND its comment
// thread from a warm cache (each per-comment useSuspenseQuery hits the cache).
async function prefetchItemTree(queryClient: any, id: number, depth: number): Promise<void> {
	const data = await queryClient.ensureQueryData(itemQuery(id));
	if (depth <= 0) return;
	const kids: number[] = (data?.kids ?? []).slice(0, SSR_COMMENT_KIDS_CAP);
	await Promise.all(kids.map((kid) => prefetchItemTree(queryClient, kid, depth - 1)));
}

export function createAppRouter(components: AppComponents, env: RouterEnv = {}) {
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

	// SSR prefetch loaders. They run inside `router.load()` and warm the
	// per-request QueryClient (`context.queryClient`) BEFORE render(), so the
	// route's `useSuspenseQuery`s read a populated cache instead of suspending
	// mid-render. They're gated on `env.isServer`: the client keeps its original
	// in-component fetch-on-render behavior unchanged (no double fetch).
	const ssr = !!env.isServer;
	const qcOf = (ctx: any) => ctx?.queryClient ?? env.queryClient;

	// A feed route prefetches its id list (`storiesQuery(feed)`) then the current
	// page's items (`pageItemsQuery(pageIds)`) — the same two queries StoriesPage
	// reads. Search (`?page=N`) comes from `loaderDeps`.
	const feedLoaderOptions = (feed: Feed) => ({
		loaderDeps: ({ search }: any) => ({ page: search?.page ?? 1 }),
		loader: ssr
			? async ({ context, deps }: any) => {
					const queryClient = qcOf(context);
					if (!queryClient) return;
					const ids: number[] = await queryClient.ensureQueryData(storiesQuery(feed));
					const start = ((deps?.page ?? 1) - 1) * PAGE_SIZE;
					await queryClient.ensureQueryData(pageItemsQuery(ids.slice(start, start + PAGE_SIZE)));
				}
			: undefined,
	});

	const rootRoute = createRootRoute({
		component: RootLayout,
		notFoundComponent: NotFound,
	});

	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: StoriesPage,
		pendingComponent: StoriesPending,
		// `?page=N` → typed 1-based page number (default 1). Drives pagination.
		validateSearch: validateFeedSearch,
		...feedLoaderOptions('top'),
	});

	// Sibling feed routes — same StoriesPage, which reads its feed from the
	// active pathname (see `feedForPath`). Paths mirror FEED_ROUTES (minus '/').
	const feedRoutes = ['newest', 'ask', 'show', 'jobs'].map((path) =>
		createRoute({
			getParentRoute: () => rootRoute,
			path,
			component: StoriesPage,
			pendingComponent: StoriesPending,
			validateSearch: validateFeedSearch,
			...feedLoaderOptions(feedForPath('/' + path)),
		}),
	);

	const itemRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'item/$id',
		component: ItemPage,
		pendingComponent: ItemPending,
		loader: ssr
			? async ({ context, params }: any) => {
					const queryClient = qcOf(context);
					if (!queryClient) return;
					await prefetchItemTree(queryClient, Number(params.id), SSR_COMMENT_PREFETCH_DEPTH);
				}
			: undefined,
	});

	const userRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'user/$id',
		component: UserPage,
		pendingComponent: UserPending,
		loader: ssr
			? async ({ context, params }: any) => {
					const queryClient = qcOf(context);
					if (!queryClient) return;
					await queryClient.ensureQueryData(userQuery(params.id ?? ''));
				}
			: undefined,
	});

	return createRouter({
		routeTree: rootRoute.addChildren([indexRoute, ...feedRoutes, itemRoute, userRoute]),
		// On the client both are undefined: createRouter falls back to a browser
		// history + reactive stores (existing behavior). On the server, env carries
		// a memory history (seeded with the request URL) + isServer:true.
		history: env.history,
		isServer: env.isServer,
		// The per-request QueryClient reaches the SSR loaders above via context.
		context: { queryClient: env.queryClient },
	});
}

/** A makeRouter factory (each app's `routes.ts` exports one). */
export type MakeRouter = (env?: RouterEnv) => any;

// Build + load a SERVER router for `url`, following any redirect the router
// issues. The feed routes' `validateSearch` normalizes `/` → `/?page=1`, which
// the server router emits as a 307 redirect (it does NOT auto-navigate on the
// server). We follow it ourselves: build a fresh memory-history router at the
// redirect target and reload, until the load settles without a redirect (capped
// to avoid a pathological loop). Returns the loaded router for render().
export async function loadServerRouter(
	makeRouter: MakeRouter,
	url: string,
	queryClient: any,
): Promise<any> {
	let target = url;
	let router: any;
	for (let i = 0; i < 5; i++) {
		const history = createMemoryHistory({ initialEntries: [target] });
		// `queryClient` reaches the routes' SSR loaders (via router context) so
		// `router.load()` prefetches this route's data into it before render().
		router = makeRouter({ history, isServer: true, queryClient });
		await router.load();
		const redirect = router.stores.redirect.get?.() ?? router.stores.redirect.value;
		const href = redirect?.options?.href ?? redirect?.href;
		if (!redirect || !href || href === target) return router;
		target = href; // follow the server redirect (e.g. `/` → `/?page=1`)
	}
	return router;
}
