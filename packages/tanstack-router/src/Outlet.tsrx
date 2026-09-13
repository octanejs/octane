declare const process: { env: { NODE_ENV?: string } };

import { useContext, Suspense } from 'octane';
import { rootRouteId } from '@tanstack/router-core';
import { useStore } from './useStore.ts';
import { useRouter, matchContext } from './context.ts';
import { Match, renderPending } from './Match.tsrx';
import { RouteNotFound } from './RouteNotFound.tsrx';
import { SafeFragment } from './SafeFragment.tsrx';
import { nonRouteComponentContext } from './nonRouteComponentContext.ts';

export function Outlet() @{
	if (process.env.NODE_ENV !== 'production') {
		const nonRouteComponent = useContext(nonRouteComponentContext);
		if (nonRouteComponent) console.warn(
			`Warning: An <Outlet /> was rendered inside a ${nonRouteComponent}. <Outlet /> should only be rendered inside a route component.`,
		);
	}
	const router = useRouter();
	const parentRouteId = useContext(matchContext)!;
	const parentStore = router.stores.getMatchStore(parentRouteId);
	const parent = useStore(
		parentStore,
		(match) => [!!match?._notFound, match?.error] as const,
		(a, b) => a[0] === b[0] && a[1] === b[1],
	);
	const childRouteId = useStore(router.stores.ids, (ids) => ids[ids.indexOf(parentRouteId) + 1]);
	const RootSuspense =
		parentRouteId === rootRouteId ? Suspense : SafeFragment;
	const PendingComponent = router.options.defaultPendingComponent;
	const pendingElement = renderPending(PendingComponent);

	@if (parent[0]) {
		<RouteNotFound routeId={parentRouteId} error={parent[1]} />
	} @else {
		@if (childRouteId) {
			<RootSuspense fallback={pendingElement}>
				<Match routeId={childRouteId} />
			</RootSuspense>
		}
	}
}
