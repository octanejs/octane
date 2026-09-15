/** @jsxImportSource octane */
import {
	Outlet,
	Scripts,
	RouterProvider,
	createRootRoute,
	createRoute,
	createRouter,
} from '../../src';
import { createRequestHandler, renderRouterToString } from '../../src/ssr/server';
import type { AnyRouter } from '../../src';
export function createContextRouteTree(
	readContext: () => { locale: string },
	onSuccess: (locale: string | undefined) => void,
) {
	const rootRoute = createRootRoute({
		component: () => (
			<>
				<Outlet />
				<Scripts />
			</>
		),
	});
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		context: readContext,
		component: () => {
			const context: { locale?: string } = indexRoute.useRouteContext();
			onSuccess(context.locale);
			return <div data-testid="route-success">Locale: {context.locale ?? 'missing'}</div>;
		},
		errorComponent: ({ error }) => (
			<div data-testid="route-error">{error instanceof Error ? error.message : String(error)}</div>
		),
	});

	return rootRoute.addChildren([indexRoute]);
}

function ContextDocument({ router }: { router: AnyRouter }) {
	return (
		<html>
			<head />
			<body>
				<RouterProvider router={router} />
			</body>
		</html>
	);
}
export function renderContextPage() {
	return createRequestHandler({
		request: new Request('http://localhost/'),
		createRouter: () =>
			createRouter({
				routeTree: createContextRouteTree(
					() => ({ locale: 'en' }),
					() => {},
				),
				isServer: true,
			}),
	})(({ router, responseHeaders }) =>
		renderRouterToString({ router, responseHeaders, App: ContextDocument }),
	);
}
