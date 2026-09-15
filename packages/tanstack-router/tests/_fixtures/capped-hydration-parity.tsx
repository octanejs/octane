/** @jsxImportSource octane */
// Shared route factories preserve identical server/client component structure.
import * as React from 'octane';
import { renderToString } from 'octane/server';
import {
	Outlet,
	RouterProvider,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	notFound,
} from '../../src';

export function makeMissingRouteTree() {
	function MissingPage() {
		return <div data-testid="missing-page">Missing page</div>;
	}

	const rootRoute = createRootRoute({
		component: Outlet,
		notFoundComponent: MissingPage,
	});
	const notFoundRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/404',
		component: MissingPage,
	});
	return rootRoute.addChildren([notFoundRoute]);
}

export function makeCappedRouteTree(
	outcome: 'error' | 'notFound',
	boundary: 'root' | 'parent',
	childLoader: () => string,
	boundaryCommits: () => void,
) {
	function BoundaryError() {
		React.useEffect(() => {
			boundaryCommits();
		}, []);
		return <div data-testid="boundary-error">Boundary error</div>;
	}

	function BoundaryNotFound() {
		React.useEffect(() => {
			boundaryCommits();
		}, []);
		return <div data-testid="boundary-not-found">Boundary not found</div>;
	}

	const boundaryOptions = {
		beforeLoad: () => {
			throw outcome === 'notFound' ? notFound() : new Error('server route failure');
		},
		pendingComponent: () => <div data-testid="boundary-pending">Boundary pending</div>,
		errorComponent: BoundaryError,
		notFoundComponent: BoundaryNotFound,
	};
	const rootRoute = createRootRoute({
		component: Outlet,
		...(boundary === 'root' ? boundaryOptions : {}),
	});
	const parentRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/parent',
		component: Outlet,
		...(boundary === 'parent' ? boundaryOptions : {}),
	});
	const childRoute = createRoute({
		getParentRoute: () => parentRoute,
		path: '/child',
		loader: childLoader,
		component: () => <div>Child</div>,
	});
	return {
		routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
	};
}

async function renderRouter(router: ReturnType<typeof createRouter>) {
	router.isServer = true;
	await router.load();
	return {
		serverHtml: renderToString(RouterProvider, { router }).html,
		serverMatches: router.stores.matches.get(),
	};
}
export function renderMissingPage() {
	return renderRouter(
		createRouter({
			routeTree: makeMissingRouteTree(),
			history: createMemoryHistory({ initialEntries: ['/404'] }),
		}),
	);
}
export function renderCappedPage(
	outcome: 'error' | 'notFound',
	boundary: 'root' | 'parent',
	childLoader: () => string,
	boundaryCommits: () => void,
) {
	return renderRouter(
		createRouter({
			...makeCappedRouteTree(outcome, boundary, childLoader, boundaryCommits),
			history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
		}),
	);
}
