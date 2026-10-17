import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	routerContext as RouterContext,
	ScriptOnce,
} from '@octanejs/tanstack-router';
import {
	CompiledOutlet,
	createRootRoute as createCompiledRootRoute,
	createRoute as createCompiledRoute,
} from '@octanejs/tanstack-router/compiled';
import type { AnyRouter, ParsedLocation } from '@tanstack/router-core';

export { RouterServer } from '../../src/ssr/RouterServer.tsrx';
export { PreconfiguredRouterProvider } from '@octanejs/tanstack-router/compiled';

// A root layout above two routes, with router-level scroll restoration. The
// server renders router-core's pre-hydration scroll restoration script under the
// root route's child match; the client build of router-core has no script source.

function RootLayout() @{
	<div class="root">
		<Outlet />
	</div>
}

function CompiledRootLayout() @{
	<div class="root">
		<CompiledOutlet />
	</div>
}

function IndexPage() @{
	<p class="index">{'Home'}</p>
}

function AboutPage() @{
	<p class="about">{'About'}</p>
}

export interface ScrollRestorationRouterOptions {
	compiled?: boolean;
	isServer?: boolean;
	nonce?: string;
	scrollRestoration?: boolean | ((options: { location: ParsedLocation }) => boolean);
}

export function makeScrollRestorationRouter(opts: ScrollRestorationRouterOptions = {}) {
	const makeRoot = opts.compiled ? createCompiledRootRoute : createRootRoute;
	const makeRoute = opts.compiled ? createCompiledRoute : createRoute;
	const rootRoute = makeRoot({ component: opts.compiled ? CompiledRootLayout : RootLayout });
	const indexRoute = makeRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: IndexPage,
	});
	const aboutRoute = makeRoute({
		getParentRoute: () => rootRoute,
		path: 'about',
		component: AboutPage,
	});

	return createRouter({
		routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
		...(opts.isServer === undefined ? {} : { isServer: opts.isServer }),
		scrollRestoration: opts.scrollRestoration ?? true,
		...(opts.nonce === undefined ? {} : { ssr: { nonce: opts.nonce } }),
	});
}

export function ScriptOnceHost(props: { router: AnyRouter }) @{
	<RouterContext value={props.router}>
		<ScriptOnce children="globalThis.__octaneScriptOnce = true" />
	</RouterContext>
}
