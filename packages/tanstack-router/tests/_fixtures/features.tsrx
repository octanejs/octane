import {
	createRouter,
	createRootRoute,
	createRoute,
	Outlet,
	lazyRouteComponent,
	Await,
} from '@octanejs/tanstack-router';
import { createMemoryHistory } from '@octanejs/tanstack-router';
import { useState } from 'octane';

function RootLayout() @{
	<div class="root">
		<Outlet />
	</div>
}

// The lazily-loaded target component.
function LazyTarget() @{
	<h1 class="lazy">{'Lazy loaded'}</h1>
}

// Uses <Await> with a React-style render-prop child returning JSX, to suspend on a
// deferred promise and render the streamed value.
function AwaitPage() @{
	const [promise] = useState(() => Promise.resolve('streamed'));
	<div class="await-page">
		<Await promise={promise} fallback="loading">
			{(value) => <span class="await-resolved">{value as string}</span>}
		</Await>
	</div>
}

// Router-owned hydration promises may be frozen or expose hostile metadata
// accessors. Await must not annotate or inspect those inputs directly.
const frozenExternalPromise = Object.freeze(Promise.resolve('externally hydrated'));

function ExternalAwaitPage() @{
	<div class="external-await-page">
		<Await promise={frozenExternalPromise} fallback="loading">
			{(value) => <span class="external-await-resolved">{value as string}</span>}
		</Await>
	</div>
}

export function makeLazyRouter() {
	const rootRoute = createRootRoute({ component: RootLayout });
	const lazyRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: lazyRouteComponent(() => Promise.resolve({ default: LazyTarget })),
	});
	return createRouter({
		routeTree: rootRoute.addChildren([lazyRoute]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
	});
}

export function makeAwaitRouter() {
	const rootRoute = createRootRoute({ component: RootLayout });
	const awaitRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: AwaitPage,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([awaitRoute]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
	});
}

export function makeExternalAwaitRouter() {
	const rootRoute = createRootRoute({ component: RootLayout });
	const awaitRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: ExternalAwaitPage,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([awaitRoute]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
	});
}

function ScrollHome() @{
	<h1 class="scroll-home">{'Scroll home'}</h1>
}
function ScrollNext() @{
	<h1 class="scroll-next">{'Scroll next'}</h1>
}

// scrollRestoration:true exercises the option wiring in Matches.
export function makeScrollRouter() {
	const rootRoute = createRootRoute({ component: RootLayout });
	const home = createRoute({ getParentRoute: () => rootRoute, path: '/', component: ScrollHome });
	const next = createRoute({
		getParentRoute: () => rootRoute,
		path: '/next',
		component: ScrollNext,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([home, next]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
		scrollRestoration: true,
	});
}
