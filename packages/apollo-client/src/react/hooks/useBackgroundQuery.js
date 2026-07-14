import * as React from 'octane';
import {
	getSuspenseCache,
	unwrapQueryRef,
	updateWrappedQueryRef,
	wrapQueryRef,
} from '@octanejs/apollo-client/react/internal';
import { skipToken } from './constants.js';
import { useSuspenseHookCacheKey, wrapHook } from './internal/index.js';
import { isCompilerSite } from './internal/site.js';
import { useApolloClient } from './useApolloClient.js';
import { useWatchQueryOptions } from './useSuspenseQuery.js';
export const useBackgroundQuery = function useBackgroundQuery(query, options) {
	'use no memo';
	if (isCompilerSite(options, skipToken)) options = undefined;
	return wrapHook(
		'useBackgroundQuery',
		useBackgroundQuery_,
		useApolloClient(typeof options === 'object' ? options.client : undefined),
	)(query, options ?? {});
};
function useBackgroundQuery_(query, options) {
	const client = useApolloClient(options.client);
	const suspenseCache = getSuspenseCache(client);
	const watchQueryOptions = useWatchQueryOptions({ client, query, options });
	const { fetchPolicy } = watchQueryOptions;
	const cacheKey = useSuspenseHookCacheKey(query, options);
	// This ref tracks the first time query execution is enabled to determine
	// whether to return a query ref or `undefined`. When initialized
	// in a skipped state (either via `skip: true` or `skipToken`) we return
	// `undefined` for the `queryRef` until the query has been enabled. Once
	// enabled, a query ref is always returned regardless of whether the query is
	// skipped again later.
	const didFetchResult = React.useRef(fetchPolicy !== 'standby');
	didFetchResult.current ||= fetchPolicy !== 'standby';
	const queryRef = suspenseCache.getQueryRef(cacheKey, () => client.watchQuery(watchQueryOptions));
	const [wrappedQueryRef, setWrappedQueryRef] = React.useState(wrapQueryRef(queryRef));
	if (unwrapQueryRef(wrappedQueryRef) !== queryRef) {
		setWrappedQueryRef(wrapQueryRef(queryRef));
	}
	if (queryRef.didChangeOptions(watchQueryOptions)) {
		const promise = queryRef.applyOptions(watchQueryOptions);
		updateWrappedQueryRef(wrappedQueryRef, promise);
	}
	// This prevents issues where rerendering useBackgroundQuery after the
	// queryRef has been disposed would cause the hook to return a new queryRef
	// instance since disposal also removes it from the suspense cache. We add
	// the queryRef back in the suspense cache so that the next render will reuse
	// this queryRef rather than initializing a new instance.
	React.useEffect(() => {
		// Since the queryRef is disposed async via `setTimeout`, we have to wait a
		// tick before checking it and adding back to the suspense cache.
		const id = setTimeout(() => {
			if (queryRef.disposed) {
				suspenseCache.add(cacheKey, queryRef);
			}
		});
		return () => clearTimeout(id);
		// Omitting the deps is intentional. This avoids stale closures and the
		// conditional ensures we aren't running the logic on each render.
	}, null);
	const fetchMore = React.useCallback(
		(options) => {
			const promise = queryRef.fetchMore(options);
			setWrappedQueryRef(wrapQueryRef(queryRef));
			return promise;
		},
		[queryRef],
	);
	const refetch = React.useCallback(
		(variables) => {
			const promise = queryRef.refetch(variables);
			setWrappedQueryRef(wrapQueryRef(queryRef));
			return promise;
		},
		[queryRef],
	);
	React.useEffect(() => queryRef.softRetain(), [queryRef]);
	return [
		didFetchResult.current ? wrappedQueryRef : void 0,
		{
			fetchMore,
			refetch,
			// TODO: The internalQueryRef doesn't have TVariables' type information so we have to cast it here
			subscribeToMore: queryRef.observable.subscribeToMore,
		},
	];
}
