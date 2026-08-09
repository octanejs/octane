import {
	Body,
	Head,
	HeadContent,
	Html,
	Outlet,
	ScriptOnce,
	Scripts,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	routerContext,
} from '@octanejs/tanstack-router';
import type { AnyRouter } from '@tanstack/router-core';

function RootDocument() @{
	<Html lang="en">
		<Head>
			<HeadContent />
		</Head>
		<Body class="document-body">
			<ScriptOnce children="globalThis.__octaneRouterSsr=true" />
			<Outlet />
			<Scripts />
		</Body>
	</Html>
}

function MultipleManagerDocument() @{
	<Html lang="en">
		<Head>
			<HeadContent />
			<HeadContent />
		</Head>
		<Body class="document-body">
			<Outlet />
			<Scripts />
			<Scripts />
		</Body>
	</Html>
}

export function ManagedHeadOwners(props: { router: AnyRouter; secondary: boolean }) @{
	<routerContext.Provider value={props.router}>
		<HeadContent />
		@if (props.secondary) {
			<HeadContent />
		}
	</routerContext.Provider>
}

function IndexPage() @{
	<>
		<main id="content">Rendered on the server</main>
		<style>
			#content {
				color: rgb(12, 34, 56);
			}
		</style>
	</>
}

export function makeSsrRouter(
	options: {
		routeSsr?: boolean | 'data-only';
		scrollRestoration?: boolean;
		multipleManagers?: boolean;
	} = {},
) {
	const rootRoute = createRootRoute({
		component: options.multipleManagers ? MultipleManagerDocument : RootDocument,
		head: () => ({
			meta: [
				{ title: 'Octane Router SSR' },
				{ name: 'description', content: 'Rendered by Octane' },
			],
			styles: [{ children: ':root { --route-style: present; }' }],
		}),
		scripts: () => [{ src: '/entry.js' }],
	});
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: IndexPage,
		ssr: options.routeSsr,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
		ssr: { nonce: 'octane-csp' },
		scrollRestoration: options.scrollRestoration,
	});
	router.isServer = true;
	return router;
}
