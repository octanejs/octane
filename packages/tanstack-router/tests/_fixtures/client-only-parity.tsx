/** @jsxImportSource octane */
// Derived from the pinned ClientOnly.test.tsx fixture; compile for each renderer.
import { renderToString } from 'octane/server';
import {
	RouterProvider,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
} from '../../src';
import { ClientOnly } from '../../src/ClientOnly';

export function createTestRouter(opts: { isServer: boolean }) {
	const history = createMemoryHistory({ initialEntries: ['/'] });

	const rootRoute = createRootRoute({});

	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: () => (
			<div>
				<p>Index Route</p>
				<ClientOnly fallback={<div data-testid="loading">Loading...</div>}>
					<div data-testid="client-only-content">Client Only Content</div>
				</ClientOnly>
			</div>
		),
	});
	const otherRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/other',
		component: () => (
			<div>
				<p data-testid="other-route">Other Route</p>
			</div>
		),
	});

	const routeTree = rootRoute.addChildren([indexRoute, otherRoute]);
	const router = createRouter({ routeTree, history, ...opts });

	return {
		router,
		routes: { indexRoute },
	};
}

export async function renderClientOnly() {
	const { router } = createTestRouter({ isServer: true });
	await router.load();
	return renderToString(RouterProvider, { router }).html;
}
