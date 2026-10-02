import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	routerContext as RouterContext,
	ScriptOnce,
} from '@octanejs/tanstack-router';
import type { AnyRouter, ParsedLocation } from '@tanstack/router-core';

export { RouterServer } from '../../src/ssr/RouterServer.tsrx';

// A root layout above two routes, with router-level scroll restoration. The
// server renders router-core's pre-hydration scroll restoration script under the
// root route's child match; the client build of router-core has no script source.

function RootLayout() @{
	<div class="root">
		<Outlet />
	</div>
}

function IndexPage() @{
	<p class="index">{'Home'}</p>
}

function AboutPage() @{
	<p class="about">{'About'}</p>
}

export interface ScrollRestorationRouterOptions {
	isServer?: boolean;
	nonce?: string;
	scrollRestoration?: boolean | ((options: { location: ParsedLocation }) => boolean);
}

export function makeScrollRestorationRouter(opts: ScrollRestorationRouterOptions = {}) {
	const rootRoute = createRootRoute({ component: RootLayout });
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: IndexPage,
	});
	const aboutRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'about',
		component: AboutPage,
	});

	return createRouter({
		routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
		isServer: opts.isServer,
		scrollRestoration: opts.scrollRestoration ?? true,
		ssr: opts.nonce === undefined ? undefined : { nonce: opts.nonce },
	});
}

export function ScriptOnceHost(props: { router: AnyRouter }) @{
	<RouterContext value={props.router}>
		<ScriptOnce children="globalThis.__octaneScriptOnce = true" />
	</RouterContext>
}
