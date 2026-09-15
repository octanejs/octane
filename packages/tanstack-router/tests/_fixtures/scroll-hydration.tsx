/** @jsxImportSource octane */
import { renderToString } from 'octane/server';
import {
	Outlet,
	RouterProvider,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
} from '../../src';

export function makeScrollRouter(isServer: boolean, enabled: boolean) {
	function Page() {
		return (
			<main>
				<input aria-label="Scroll hydration note" defaultValue="server" />
			</main>
		);
	}
	const root = createRootRoute({ component: Outlet });
	const page = createRoute({ getParentRoute: () => root, path: '/scroll', component: Page });
	return createRouter({
		routeTree: root.addChildren([page]),
		history: createMemoryHistory({ initialEntries: ['/scroll'] }),
		isServer,
		scrollRestoration: () => enabled,
	});
}

export async function renderScrollPage(enabled: boolean) {
	const router = makeScrollRouter(true, enabled);
	await router.load();
	return renderToString(RouterProvider, { router }).html;
}
