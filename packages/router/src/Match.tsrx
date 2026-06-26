// Renders one route match: subscribe to its per-match store, render the route's
// `component` (or `<Outlet/>` if it has none, e.g. a layout route), and publish its
// own match id via `matchContext` so a nested `<Outlet/>` can chain to the next
// match. The route component is wrapped in a `@try`/`@pending` Suspense boundary
// (the route's pendingComponent is the fallback) so lazy components and
// `use(deferred)` suspend gracefully. v1 renders the happy path; error/not-found
// boundaries arrive next.
import { useStore } from './useStore.ts';
import { useRouter, matchContext } from './context.ts';
import { Outlet } from './Outlet.tsrx';

export function Match(props) @{
	const router = useRouter();
	const matchStore = router.stores.matchStores.get(props.matchId);
	const match = useStore(matchStore, (m) => m);
	const route = router.routesById[match.routeId];
	const Comp = route.options.component;
	const Pending = route.options.pendingComponent ?? router.options.defaultPendingComponent;

	<matchContext.Provider value={props.matchId}>
		@try {
			@if (Comp) {
				<Comp />
			} @else {
				<Outlet />
			}
		} @pending {
			@if (Pending) {
				<Pending />
			}
		}
	</matchContext.Provider>
}
