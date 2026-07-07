// Renders one route match: subscribe to its per-match store, render the route's
// `component` (or `<Outlet/>` if it has none, e.g. a layout route), and publish its
// own match id via `matchContext` so a nested `<Outlet/>` can chain to the next
// match. The route component is wrapped in a `@try`/`@pending` Suspense boundary
// (the route's pendingComponent is the fallback) so lazy components and
// `use(deferred)` suspend gracefully. A match that resolved with
// `status === 'notFound'` (its loader threw `notFound()`) renders the route's
// not-found UI instead of its component, per react-router's MatchInner; the
// unknown-URL (`globalNotFound`) case is handled by `<Outlet/>`. Error boundaries
// arrive next.
import { useStore } from './useStore.ts';
import { useRouter, matchContext } from './context.ts';
import { Outlet } from './Outlet.tsrx';
import { RouteNotFound } from './RouteNotFound.tsrx';

export function Match(props) @{
	const router = useRouter();
	const matchStore = router.stores.matchStores.get(props.matchId);
	const match = useStore(matchStore, (m) => m);
	const route = router.routesById[match.routeId];
	const Comp = route.options.component;
	const Pending = route.options.pendingComponent ?? router.options.defaultPendingComponent;

	<matchContext.Provider value={props.matchId}>
		@try {
			@if (match.status === 'notFound') {
				<RouteNotFound routeId={match.routeId} error={match.error} />
			} @else {
				@if (Comp) {
					<Comp />
				} @else {
					<Outlet />
				}
			}
		} @pending {
			@if (Pending) {
				<Pending />
			}
		}
	</matchContext.Provider>
}
