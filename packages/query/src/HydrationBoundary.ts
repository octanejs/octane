import { hydrate } from '@tanstack/query-core';
import { resolveClient } from './context';

// HydrationBoundary — hydrates dehydrated query state into the client, then renders
// its children. It's a built-in component: it renders children by invoking the
// children render-body with its scope (the same convention a context Provider
// uses), so it composes in JSX as `<HydrationBoundary state={…}>…</HydrationBoundary>`.
//
// The hydrate is idempotent: only queries that are NEW or NEWER than what's already
// in the cache are applied, so a re-render never clobbers fresher client data. (The
// react-query binding defers this to useMemo/useEffect for concurrent rendering;
// octane renders synchronously, so running it in the body is sufficient.)
export function HydrationBoundary(props: any, scope: any): void {
	const client = resolveClient(props.queryClient);
	const state = props.state;
	if (state && typeof state === 'object') {
		const queryCache = client.getQueryCache();
		const toHydrate: any[] = [];
		for (const dehydratedQuery of state.queries || []) {
			const existing = queryCache.get(dehydratedQuery.queryHash);
			if (!existing || dehydratedQuery.state.dataUpdatedAt > existing.state.dataUpdatedAt) {
				toHydrate.push(dehydratedQuery);
			}
		}
		if (toHydrate.length > 0) {
			hydrate(client, { queries: toHydrate }, props.options);
		}
	}
	if (typeof props.children === 'function') {
		props.children(undefined, scope);
	}
}
