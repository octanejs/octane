import * as React from 'octane';
import { useDeepMemo, wrapHook } from './internal/index.js';
import { subSite } from './internal/site.js';
import { useApolloClient } from './useApolloClient.js';
import { useSyncExternalStore } from './useSyncExternalStore.js';
export function useFragment(options, site) {
	'use no memo';
	return wrapHook('useFragment', useFragment_, useApolloClient(options.client))(options, site);
}
function useFragment_(options, site) {
	const client = useApolloClient(options.client);
	const { from, ...rest } = options;
	const { cache } = client;
	// We calculate the cache id seperately because we don't want changes to non
	// key fields in the `from` property to recreate the observable. If the cache
	// identifier stays the same between renders, we want to reuse the existing
	// subscription.
	const ids = useDeepMemo(
		() => {
			const fromArray = Array.isArray(from) ? from : [from];
			const ids = fromArray.map((value) =>
				typeof value === 'string' ? value : value === null ? null : cache.identify(value),
			);
			return Array.isArray(from) ? ids : ids[0];
		},
		[cache, from],
		subSite(site, 'ids'),
	);
	const stableOptions = useDeepMemo(
		() => ({ ...rest, from: ids }),
		[rest, ids],
		subSite(site, 'options'),
	);
	const observable = React.useMemo(
		() => client.watchFragment(stableOptions),
		[client, stableOptions],
	);
	// Unfortunately we forgot to update the use case of `from: null` on
	// useFragment in 4.0 to match `useSuspenseFragment`. As such, we need to
	// fallback to data: {} with complete: false when `from` is `null` to maintain
	// backwards compatibility. We should plan to change this in v5.
	const getSnapshot = React.useCallback(
		() => (from === null ? nullResult : observable.getCurrentResult()),
		[from, observable],
	);
	return useSyncExternalStore(
		React.useCallback(
			(update) => {
				let lastTimeout = 0;
				const subscription = observable.subscribe({
					next: () => {
						// If we get another update before we've re-rendered, bail out of
						// the update and try again. This ensures that the relative timing
						// between useQuery and useFragment stays roughly the same as
						// fixed in https://github.com/apollographql/apollo-client/pull/11083
						clearTimeout(lastTimeout);
						lastTimeout = setTimeout(update);
					},
				});
				return () => {
					subscription.unsubscribe();
					clearTimeout(lastTimeout);
				};
			},
			[observable],
		),
		getSnapshot,
		getSnapshot,
	);
}
const nullResult = Object.freeze({
	data: {},
	dataState: 'partial',
	complete: false,
});
