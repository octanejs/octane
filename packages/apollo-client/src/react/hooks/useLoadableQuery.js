import * as React from 'octane';
import { canonicalStringify } from '@apollo/client/cache';
import {
	assertWrappedQueryRef,
	getSuspenseCache,
	unwrapQueryRef,
	updateWrappedQueryRef,
	wrapQueryRef,
} from '@octanejs/apollo-client/react/internal';
import { __DEV__ } from '@apollo/client/utilities/environment';
import { invariant } from '@apollo/client/utilities/invariant';
import { useDeepMemo, useRenderGuard } from './internal/index.js';
import { isCompilerSite } from './internal/site.js';
import { validateSuspenseHookOptions } from './internal/validateSuspenseHookOptions.js';
import { useApolloClient } from './useApolloClient.js';
export const useLoadableQuery = function useLoadableQuery(query, options = {}) {
	if (isCompilerSite(options)) options = {};
	const client = useApolloClient(options.client);
	const suspenseCache = getSuspenseCache(client);
	const watchQueryOptions = useWatchQueryOptions({ client, query, options });
	const { queryKey = [] } = options;
	const [queryRef, setQueryRef] = React.useState(null);
	assertWrappedQueryRef(queryRef);
	const internalQueryRef = queryRef && unwrapQueryRef(queryRef);
	if (queryRef && internalQueryRef?.didChangeOptions(watchQueryOptions)) {
		const promise = internalQueryRef.applyOptions(watchQueryOptions);
		updateWrappedQueryRef(queryRef, promise);
	}
	const calledDuringRender = useRenderGuard();
	const fetchMore = React.useCallback(
		(options) => {
			if (!internalQueryRef) {
				throw new Error('The query has not been loaded. Please load the query.');
			}
			const promise = internalQueryRef.fetchMore(options);
			setQueryRef(wrapQueryRef(internalQueryRef));
			return promise;
		},
		[internalQueryRef],
	);
	const refetch = React.useCallback(
		(options) => {
			if (!internalQueryRef) {
				throw new Error('The query has not been loaded. Please load the query.');
			}
			const promise = internalQueryRef.refetch(options);
			setQueryRef(wrapQueryRef(internalQueryRef));
			return promise;
		},
		[internalQueryRef],
	);
	const loadQuery = React.useCallback(
		(...args) => {
			invariant(!calledDuringRender(), 31);
			const [variables] = args;
			const cacheKey = [query, canonicalStringify(variables), ...[].concat(queryKey)];
			const queryRef = suspenseCache.getQueryRef(cacheKey, () =>
				client.watchQuery({
					...watchQueryOptions,
					variables,
				}),
			);
			setQueryRef(wrapQueryRef(queryRef));
		},
		[query, queryKey, suspenseCache, watchQueryOptions, calledDuringRender, client],
	);
	const subscribeToMore = React.useCallback(
		(options) => {
			invariant(internalQueryRef, 32);
			return internalQueryRef.observable.subscribeToMore(
				// TODO: The internalQueryRef doesn't have TVariables' type information so we have to cast it here
				options,
			);
		},
		[internalQueryRef],
	);
	const reset = React.useCallback(() => {
		setQueryRef(null);
	}, []);
	return [loadQuery, queryRef, { fetchMore, refetch, reset, subscribeToMore }];
};
function useWatchQueryOptions({ client, query, options }) {
	return useDeepMemo(() => {
		const fetchPolicy =
			options.fetchPolicy || client.defaultOptions.watchQuery?.fetchPolicy || 'cache-first';
		const watchQueryOptions = {
			...options,
			fetchPolicy,
			query,
			notifyOnNetworkStatusChange: false,
			nextFetchPolicy: void 0,
		};
		if (__DEV__) {
			validateSuspenseHookOptions(watchQueryOptions);
		}
		return watchQueryOptions;
	}, [client, options, query]);
}
