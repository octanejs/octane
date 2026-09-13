/** @jsxImportSource octane */
// Route definitions and request ordering extracted from the pinned SSR cases.
// Keep them in a server-compiled graph; assertions remain in the adapted tests.
import {
	HeadContent,
	Outlet,
	createControlledPromise,
	createLazyRoute,
	createRootRoute,
	createRootRouteWithContext,
	createRoute,
	createRouter,
	notFound,
} from '../../src';
import { RouterServer, createRequestHandler, renderRouterToString } from '../../src/ssr/server';
function primitiveThrowFn() {
	throw 'primitive error thrown';
}
function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

export async function renderPrimitiveError() {
	const rootRoute = createRootRoute({
		component: function Root() {
			return <Outlet />;
		},
	});
	const aboutRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/about',
		beforeLoad: primitiveThrowFn,
		component: function About() {
			return <div>About route content</div>;
		},
		errorComponent: ({ error }) => <div>Error: {String(error)}</div>,
	});

	const handler = createRequestHandler({
		request: new Request('http://localhost/about'),
		createRouter: () =>
			createRouter({
				routeTree: rootRoute.addChildren([aboutRoute]),
				isServer: true,
			}),
	});

	const response = await handler(({ router, responseHeaders }) =>
		renderRouterToString({
			router,
			responseHeaders,
			App: RouterServer,
		}),
	);

	return response;
}

export async function renderAncestorError() {
	const parentStarted = createControlledPromise<void>();
	const childStarted = createControlledPromise<void>();
	const parentGate = createControlledPromise<void>();
	const childGate = createControlledPromise<void>();
	const childSettled = createControlledPromise<void>();
	const rootRoute = createRootRoute({ component: Outlet });
	const parentRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/parent',
		component: Outlet,
		loader: async () => {
			parentStarted.resolve();
			await parentGate;
			throw new Error('later parent failure');
		},
		errorComponent: () => <div>Parent error boundary</div>,
	});
	const childRoute = createRoute({
		getParentRoute: () => parentRoute,
		path: '/child',
		loader: async () => {
			childStarted.resolve();
			await childGate;
			childSettled.resolve();
			throw new Error('first child failure');
		},
		errorComponent: () => <div>Child error boundary</div>,
	});
	const handler = createRequestHandler({
		request: new Request('http://localhost/parent/child'),
		createRouter: () =>
			createRouter({
				routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
				isServer: true,
			}),
	});

	const responsePromise = handler(({ router, responseHeaders }) =>
		renderRouterToString({
			router,
			responseHeaders,
			App: RouterServer,
		}),
	);
	await Promise.all([parentStarted, childStarted]);
	childGate.resolve();
	await childSettled;
	parentGate.resolve();
	const response = await responsePromise;

	return response;
}

export async function renderErrorHead() {
	const rootRoute = createRootRoute({
		head: () => ({
			links: [{ rel: 'stylesheet', href: '/global.css' }],
		}),
		shellComponent: function RootDocument({ children }) {
			return (
				<html>
					<head>
						<HeadContent />
					</head>
					<body>{children}</body>
				</html>
			);
		},
		component: Outlet,
	});
	const failingRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/fail',
		beforeLoad: () => {
			throw new Error('beforeLoad failed');
		},
		head: ({ match }) => ({
			meta: [{ title: match.error ? 'Error title' : 'Success title' }],
		}),
		component: function FailingRoute() {
			return <div>Route content</div>;
		},
		errorComponent: ({ error }) => <div>Error UI: {getErrorMessage(error)}</div>,
	});

	const handler = createRequestHandler({
		request: new Request('http://localhost/fail'),
		createRouter: () =>
			createRouter({
				routeTree: rootRoute.addChildren([failingRoute]),
				isServer: true,
			}),
	});

	const response = await handler(({ router, responseHeaders }) =>
		renderRouterToString({
			router,
			responseHeaders,
			App: RouterServer,
		}),
	);

	return response;
}

export async function renderLazyNotFound() {
	const rootRoute = createRootRoute({
		component: Outlet,
		notFoundComponent: () => <div>Root not found</div>,
	});
	const failingRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/lazy-not-found',
		beforeLoad: () => {
			throw notFound();
		},
	}).lazy(() =>
		Promise.resolve(
			createLazyRoute('/lazy-not-found')({
				notFoundComponent: () => <div>Lazy route not found</div>,
			}),
		),
	);
	const handler = createRequestHandler({
		request: new Request('http://localhost/lazy-not-found'),
		createRouter: () =>
			createRouter({
				routeTree: rootRoute.addChildren([failingRoute]),
				isServer: true,
			}),
	});

	const response = await handler(({ router, responseHeaders }) =>
		renderRouterToString({
			router,
			responseHeaders,
			App: RouterServer,
		}),
	);

	return response;
}

export async function renderFuzzyNotFound() {
	const rootRoute = createRootRoute({
		component: Outlet,
		notFoundComponent: () => <div>Root fuzzy boundary</div>,
	});
	const parentRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/parent',
		component: Outlet,
		notFoundComponent: () => <div>Parent fuzzy boundary</div>,
	});
	const childRoute = createRoute({
		getParentRoute: () => parentRoute,
		path: '/child',
	}).lazy(() =>
		Promise.resolve(
			createLazyRoute('/parent/child')({
				notFoundComponent: () => <div>Lazy child fuzzy boundary</div>,
			}),
		),
	);
	const routeTree = rootRoute.addChildren([parentRoute.addChildren([childRoute])]);
	const response = await createRequestHandler({
		request: new Request('http://localhost/parent/child/missing'),
		createRouter: () => createRouter({ routeTree, isServer: true }),
	})(({ router, responseHeaders }) =>
		renderRouterToString({
			router,
			responseHeaders,
			App: RouterServer,
		}),
	);

	return response;
}

function createContextRouteTree() {
	const rootRoute = createRootRouteWithContext<{
		routerValue: string;
	}>()({
		context: () => ({ rootValue: 'from root' }),
	});
	const parentRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/parent',
		context: () => ({ parentValue: 'from parent' }),
		component: ParentComponent,
	});
	const childRoute = createRoute({
		getParentRoute: () => parentRoute,
		path: '/child',
		context: (): { childValue: string } => {
			throw notFound();
		},
		component: () => <div>Child content</div>,
		notFoundComponent: ChildNotFoundComponent,
	});

	function ParentComponent() {
		const context = parentRoute.useRouteContext();

		return (
			<>
				<output data-testid="parent-context">
					{[context.routerValue, context.rootValue, context.parentValue].join(' / ')}
				</output>
				<Outlet />
			</>
		);
	}

	function ChildNotFoundComponent() {
		const context = parentRoute.useRouteContext();

		return (
			<output data-testid="not-found-context">
				{[context.routerValue, context.rootValue, context.parentValue].join(' / ')}
			</output>
		);
	}

	return rootRoute.addChildren([parentRoute.addChildren([childRoute])]);
}

export async function renderNotFoundContext() {
	const response = await createRequestHandler({
		request: new Request('http://localhost/parent/child'),
		createRouter: () =>
			createRouter({
				routeTree: createContextRouteTree(),
				context: { routerValue: 'from router' },
				isServer: true,
			}),
	})(({ router, responseHeaders }) =>
		renderRouterToString({
			router,
			responseHeaders,
			App: RouterServer,
		}),
	);

	return response;
}
