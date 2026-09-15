/** @jsxImportSource octane */
import * as React from 'octane';
import { renderToString } from 'octane/server';
import {
	RouterProvider,
	createControlledPromise,
	createMemoryHistory,
	createRootRoute,
	createRouter,
} from '../../src';

export function makeStateRoute(
	initializers: () => string,
	mounts: () => void,
	unmounts: () => void,
) {
	const rootRoute = createRootRoute({
		pendingComponent: () => <div>Root pending</div>,
		component: function RootComponent() {
			const [value] = React.useState(initializers);
			React.useEffect(() => {
				mounts();
				return unmounts;
			}, []);
			return <div data-testid="root-content">{value}</div>;
		},
	});
	return rootRoute;
}

function makeFunctionalRoute() {
	const rootRoute = createRootRoute({
		ssr: () => true,
		pendingComponent: () => <div>Root pending</div>,
		component: () => <div>Root content</div>,
	});
	return rootRoute;
}

export async function renderPendingShell() {
	const gate = createControlledPromise<void>();
	const rootRoute = createRootRoute({
		pendingComponent: () => <div>Server root pending</div>,
		shellComponent: ({ children }) => (
			<html>
				<head />
				<body>{children}</body>
			</html>
		),
		component: () => {
			throw gate;
		},
	});
	const router = createRouter({
		routeTree: rootRoute,
		history: createMemoryHistory({ initialEntries: ['/'] }),
	});
	router.isServer = true;
	await router.load();

	return renderToString(RouterProvider, { router }).html;
}

export async function renderStateRoute(
	initializers: () => string,
	mounts: () => void,
	unmounts: () => void,
) {
	const router = createRouter({
		routeTree: makeStateRoute(initializers, mounts, unmounts),
		history: createMemoryHistory({ initialEntries: ['/'] }),
	});
	await router.load();
	router.ssr = { manifest: { routes: {} } };
	router.isServer = true;
	return renderToString(RouterProvider, { router }).html;
}
export async function renderFunctionalRoute() {
	const router = createRouter({
		routeTree: makeFunctionalRoute(),
		history: createMemoryHistory({ initialEntries: ['/'] }),
	});
	await router.load();
	router.ssr = { manifest: { routes: {} } };
	router.isServer = true;
	return renderToString(RouterProvider, { router }).html;
}
