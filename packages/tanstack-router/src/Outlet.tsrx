// Renders the child match below the current one. Reads the current routeId from
// `matchContext`, finds the NEXT id in the route-id chain (`stores.ids`), and
// renders its `<Match/>` — the pull-based descent that replaces a top-down state
// diff. Renders nothing at a leaf.
//
// Not-found (react-router's Outlet, same order): when the URL matched no route,
// router-core flags ONE match `_notFound` — with the default
// `notFoundMode: 'fuzzy'` the deepest fuzzy-matched route that has children, with
// `notFoundMode: 'root'` the root. That match still renders its own component
// (the layout), and its `<Outlet/>` renders the not-found UI INSTEAD of a child
// match — so the 404 lands inside the layout chrome.
import { useContext, createElement, Suspense } from 'octane';
import { rootRouteId } from '@tanstack/router-core';
import { useStore } from './useStore.ts';
import { useRouter, matchContext } from './context.ts';
import { Match } from './Match.tsrx';
import { RouteNotFound } from './RouteNotFound.tsrx';
import { SafeFragment } from './SafeFragment.tsrx';

export function Outlet() @{
	const router = useRouter();
	// Outlet only renders inside a match's component, so the context routeId (and
	// its store) are present — same invariant upstream asserts with invariant().
	// router-core 1.171.34 keys stores by routeId (`getMatchStore`/`ids`) and
	// renamed the global-not-found match flag `globalNotFound` → `_notFound`.
	const routeId = useContext(matchContext)!;
	const parentStore = router.stores.getMatchStore(routeId);
	const notFound = useStore(
		parentStore,
		(m: any) => ({ global: !!m?._notFound, error: m?.error }),
		(a, b) => a.global === b.global && a.error === b.error,
	);
	const childId = useStore(router.stores.ids, (ids: Array<string>) => {
		const i = ids.indexOf(routeId);
		return i >= 0 ? ids[i + 1] : undefined;
	});

	// The root route's outlet wraps the first real match in a Suspense boundary
	// whose fallback is the router's defaultPendingComponent (react-router's
	// Outlet does the same) — the outermost pending UI for the initial load.
	const DefaultPending = router.options.defaultPendingComponent;
	const RootSuspense = routeId === rootRouteId ? Suspense : SafeFragment;
	const pendingElement = DefaultPending ? createElement(DefaultPending, {}) : null;

	@if (notFound.global) {
		<RouteNotFound routeId={routeId} error={notFound.error} />
	} @else {
		@if (childId) {
			<RootSuspense fallback={pendingElement}>
				<Match routeId={childId} />
			</RootSuspense>
		}
	}
}
