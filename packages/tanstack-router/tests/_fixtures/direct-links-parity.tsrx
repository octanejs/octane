import { renderToString } from 'octane/server';
import {
	Link,
	RouterProvider,
	createRootRoute,
	createRoute,
	createRouter,
	createMemoryHistory,
} from '../../src/index.ts';

// Route tree from the pinned direct-scheme link test, shared by both compilers.
export function createDirectLinksRouter(isServer = false) {
	const rootRoute = createRootRoute();
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: () => <>
			<Link data-testid="allowed-link" to="https://example.com">
				{({ isActive }) => String(isActive)}
			</Link>
			<Link data-testid="dangerous-link" to="javascript:alert(1)">
				{({ isActive }) => String(isActive)}
			</Link>
		</>,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([indexRoute]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
		isServer,
	});
}

export async function renderDirectLinks() {
	const router = createDirectLinksRouter(true);
	await router.load();
	return renderToString(RouterProvider, { router }).html;
}
