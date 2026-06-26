// Renders one route match: subscribe to its per-match store, render the route's
// `component` (or `<Outlet/>` if it has none, e.g. a layout route), and publish its
// own match id via `matchContext` so a nested `<Outlet/>` can chain to the next
// match. v1 renders the happy path; pending/error/not-found boundaries arrive with
// loaders.
import { useStore } from './useStore.ts';
import { useRouter, matchContext } from './context.ts';
import { Outlet } from './Outlet.tsrx';

export function Match(props) @{
	const router = useRouter();
	const matchStore = router.stores.matchStores.get(props.matchId);
	const match = useStore(matchStore, (m) => m);
	const route = router.routesById[match.routeId];
	const Comp = route.options.component;

	<matchContext.Provider value={props.matchId}>
		@if (Comp) {
			<Comp />
		} @else {
			<Outlet />
		}
	</matchContext.Provider>
}
