import {
	createRouter,
	createRootRoute,
	createRoute,
	createMemoryHistory,
	Outlet,
	redirect,
	useLoaderData,
} from '@octanejs/tanstack-router';

// A route match suspends on a different router promise per state (display
// pending, force pending, pending, redirected). These routes move a suspended
// match from one state into another, so the component must not render until
// the state that gates it has ended.

export interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

export function createDeferred<T>(): Deferred<T> {
	let resolve: ((value: T) => void) | undefined;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve: (value: T) => resolve!(value) };
}

// Every route-component render records the loader data it read, including
// renders that never commit, so an early render shows up as `undefined`.
export const componentRenders: Array<{ route: string; data: unknown }> = [];

let clientLoader: Deferred<string> | null = null;
let guardLoader: Deferred<void> | null = null;

function RootLayout() @{
	<div class="root">
		<Outlet />
	</div>
}

function HomePage() @{
	<p class="home">{'home'}</p>
}

function PendingPage() @{
	<p class="pending">{'pending'}</p>
}

function ClientPage() @{
	const data = useLoaderData({ strict: false });
	componentRenders.push({ route: '/client', data });
	<p class="client">{String(data)}</p>
}

function GuardedPage() @{
	const data = useLoaderData({ strict: false });
	componentRenders.push({ route: '/guarded', data });
	<p class="guarded">{'guarded'}</p>
}

function TargetPage() @{
	<p class="target">{'target'}</p>
}

export interface MatchSuspensionRouterOptions {
	/** Loader deferred for the `ssr: false` /client route. */
	client?: Deferred<string>;
	/** Deferred the /guarded loader awaits before it redirects to /target. */
	guard?: Deferred<void>;
}

export function makeMatchSuspensionRouter(
	initial: string,
	opts: MatchSuspensionRouterOptions = {},
) {
	clientLoader = opts.client ?? null;
	guardLoader = opts.guard ?? null;
	componentRenders.length = 0;

	const rootRoute = createRootRoute({ component: RootLayout });
	const homeRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: HomePage,
	});
	const clientRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'client',
		ssr: false,
		component: ClientPage,
		pendingComponent: PendingPage,
		// Hydration force-pends this match for pendingMinMs (router-core defaults
		// it to 500ms); the loader outlasts it.
		pendingMinMs: 20,
		loader: () => clientLoader!.promise,
	});
	const guardedRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'guarded',
		component: GuardedPage,
		pendingComponent: PendingPage,
		pendingMs: 1,
		pendingMinMs: 1,
		loader: async () => {
			await guardLoader!.promise;
			throw redirect({ to: '/target' });
		},
	});
	const targetRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'target',
		component: TargetPage,
		// The redirect target loads on a timer, so the redirected match has to
		// stay suspended across real macrotasks.
		loader: () => new Promise<void>((resolve) => setTimeout(resolve, 30)),
	});

	return createRouter({
		routeTree: rootRoute.addChildren([homeRoute, clientRoute, guardedRoute, targetRoute]),
		history: createMemoryHistory({ initialEntries: [initial] }),
	});
}
