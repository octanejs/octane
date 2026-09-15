import { afterEach, expect, it, vi } from 'vitest';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
} from '@octanejs/tanstack-router';
import { getHandleRouteUpdateCode } from '../src/internal/router-plugin/core/hmr/handle-route-update.js';

const previousRouter = window.__TSR_ROUTER__;
afterEach(() => {
	window.__TSR_ROUTER__ = previousRouter;
});

it('refreshes active loader data through the current Router HMR contract', async () => {
	const root = createRootRoute();
	const route = createRoute({
		getParentRoute: () => root,
		path: '/active',
		loader: () => 'before',
	});
	const router = createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: ['/active'] }),
	});
	window.__TSR_ROUTER__ = router;
	await router.load();
	expect(router.state.matches.at(-1)?.loaderData).toBe('before');
	const next = createRoute({ getParentRoute: () => root, path: '/active', loader: () => 'after' });
	const update = new Function(`return (${getHandleRouteUpdateCode([])});`)() as (
		id: string,
		next: typeof route,
		apply?: boolean,
	) => void;
	update(route.id, next);
	await vi.waitFor(() => expect(router.state.matches.at(-1)?.loaderData).toBe('after'));
	expect(router.routesById[route.id]).toBe(route);
	expect(next.id).toBe(route.id);
	expect(next.parentRoute).toBe(root);

	const skipped = createRoute({
		getParentRoute: () => root,
		path: '/active',
		loader: () => 'skipped',
	});
	update(route.id, skipped, false);
	expect(router.state.matches.at(-1)?.loaderData).toBe('after');
	expect(skipped.options).toBe(route.options);
});
