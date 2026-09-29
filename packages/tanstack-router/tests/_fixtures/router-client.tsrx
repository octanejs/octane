import {
	createRouter,
	createRootRoute,
	createRoute,
	createMemoryHistory,
	Outlet,
	useLoaderData,
} from '@octanejs/tanstack-router';

export { RouterServer } from '../../src/ssr/RouterServer.tsrx';

// A server-rendered root layout above an `ssr: false` child route. The server
// renders the child's pending component; the client hydrates the root match,
// then runs the child's loader while the pending component stays up.

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

function RootLayout() @{
	<div class="root">
		<Outlet />
	</div>
}

function PendingPage() @{
	<p class="pending">{'pending'}</p>
}

function ClientPage() @{
	const data = useLoaderData({ strict: false });
	<p class="client">{String(data)}</p>
}

export interface RouterClientRouterOptions {
	/** Loader deferred for the `ssr: false` /client route; the server never runs it. */
	loader?: Deferred<string>;
	isServer?: boolean;
}

export function makeRouterClientRouter(opts: RouterClientRouterOptions = {}) {
	const rootRoute = createRootRoute({ component: RootLayout });
	const clientRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'client',
		ssr: false,
		component: ClientPage,
		pendingComponent: PendingPage,
		// No force-pending window: the match waits on its loader alone.
		pendingMinMs: 0,
		loader: () => opts.loader!.promise,
	});

	return createRouter({
		routeTree: rootRoute.addChildren([clientRoute]),
		history: createMemoryHistory({ initialEntries: ['/client'] }),
		isServer: opts.isServer,
	});
}
