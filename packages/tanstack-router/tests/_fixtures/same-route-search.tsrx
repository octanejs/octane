import {
	createRouter,
	createRootRoute,
	createRoute,
	Outlet,
	useSearch,
	useRouterState,
	createMemoryHistory,
} from '@octanejs/tanstack-router';
import { use, useDeferredValue } from 'octane';

// A layout that just renders an <Outlet/> for the active route.
function RootLayout() @{
	const isLoading = useRouterState({ select: (s: any) => s.isLoading });
	<div class="root" data-loading={String(isLoading)}>
		<Outlet />
	</div>
}

// A distinct fallback makes urgent and explicitly deferred navigation observable.
function StoriesPending() @{
	<div class="stories-pending">{'Loading page…'}</div>
}

// Per-page deferreds, resolved manually by the test so the suspense window is
// fully deterministic. Keyed by page number; `deferredFor(page)` returns the same
// promise for the same page so `use()` suspends until the test resolves it.
export interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function makeDeferred<T>(): Deferred<T> {
	let resolve: ((value: T) => void) | undefined;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve: (value: T) => resolve!(value) };
}

const deferreds = new Map<number, Deferred<string>>();

export function deferredFor(page: number): Deferred<string> {
	let d = deferreds.get(page);
	if (!d) {
		d = makeDeferred<string>();
		deferreds.set(page, d);
	}
	return d;
}

export function resetDeferreds(): void {
	deferreds.clear();
}

// The data view suspends on its `page` PROP's deferred. It does not subscribe to
// any router store itself — it only re-renders when its parent re-renders with a
// new `page`. So the render priority of THIS re-render (and its suspend) is
// inherited from the parent's re-render, which is driven by the router's
// search-param commit.
function PageView(props: { page: number }) @{
	const value = use(deferredFor(props.page).promise);
	<h1 class="stories" data-page={String(props.page)}>{value as string}</h1>
}

// External store updates are urgent. The route may opt into stale content by
// deferring the scalar render input while the router's location updates eagerly.
function StoriesPage() @{
	const page = useSearch({ strict: false, select: (s: any) => s.page ?? 1 }) as number;
	<PageView page={page} />
}

function DeferredStoriesPage() @{
	const nextPage = useSearch({ strict: false, select: (s: any) => s.page ?? 1 }) as number;
	const page = useDeferredValue(nextPage);
	<PageView page={page} />
}

// Builds a single-route router whose '/' route reads `?page` and suspends per page.
export function makeSameRouteSearchRouter(
	initial: string,
	options: { isServer?: boolean; deferPage?: boolean } = {},
) {
	const rootRoute = createRootRoute({ component: RootLayout });
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: options.deferPage ? DeferredStoriesPage : StoriesPage,
		pendingComponent: StoriesPending,
		validateSearch: (search: Record<string, unknown>) => ({
			page: search.page != null ? Number(search.page) : 1,
		}),
	});
	return createRouter({
		routeTree: rootRoute.addChildren([indexRoute]),
		history: createMemoryHistory({ initialEntries: [initial] }),
		isServer: options.isServer,
	});
}
