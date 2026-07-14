import * as React from 'octane';
import { NetworkStatus } from '@apollo/client';
import { getSuspenseCache } from '@octanejs/apollo-client/react/internal';
import { __DEV__ } from '@apollo/client/utilities/environment';
import { variablesUnknownSymbol } from '@apollo/client/utilities/internal';
import { skipToken } from './constants.js';
import { __use, useDeepMemo, useSuspenseHookCacheKey, wrapHook } from './internal/index.js';
import { isCompilerSite } from './internal/site.js';
import { validateSuspenseHookOptions } from './internal/validateSuspenseHookOptions.js';
import { useApolloClient } from './useApolloClient.js';
export const useSuspenseQuery = function useSuspenseQuery(query, options, site) {
	'use no memo';
	if (isCompilerSite(options, skipToken)) {
		site = options;
		options = undefined;
	}
	return wrapHook(
		'useSuspenseQuery',
		useSuspenseQuery_,
		useApolloClient(typeof options === 'object' ? options.client : undefined),
	)(query, options ?? {}, site);
};
function useSuspenseQuery_(query, options, site) {
	const client = useApolloClient(options.client);
	const suspenseCache = getSuspenseCache(client);
	const watchQueryOptions = useWatchQueryOptions({
		client,
		query,
		options,
	});
	const { fetchPolicy } = watchQueryOptions;
	const cacheKey = useSuspenseHookCacheKey(query, options);
	const queryRef = suspenseCache.getQueryRef(cacheKey, () => client.watchQuery(watchQueryOptions));
	let [current, setPromise] = React.useState([queryRef.key, queryRef.promise]);
	// This saves us a re-execution of the render function when a variable changed.
	if (current[0] !== queryRef.key) {
		// eslint-disable-next-line react-hooks/immutability
		current[0] = queryRef.key;
		// eslint-disable-next-line react-hooks/immutability
		current[1] = queryRef.promise;
	}
	let promise = current[1];
	if (queryRef.didChangeOptions(watchQueryOptions)) {
		// eslint-disable-next-line react-hooks/immutability
		current[1] = promise = queryRef.applyOptions(watchQueryOptions);
	}
	React.useEffect(() => {
		const dispose = queryRef.retain();
		const removeListener = queryRef.listen((promise) => {
			setPromise([queryRef.key, promise]);
		});
		return () => {
			removeListener();
			dispose();
		};
	}, [queryRef]);
	const skipResult = React.useMemo(() => {
		const error = queryRef.result.error;
		const complete = !!queryRef.result.data;
		return {
			loading: false,
			data: queryRef.result.data,
			dataState: queryRef.result.dataState,
			networkStatus: error ? NetworkStatus.error : NetworkStatus.ready,
			error,
			complete,
			partial: !complete,
		};
	}, [queryRef.result]);
	const result = fetchPolicy === 'standby' ? skipResult : __use(promise, site);
	const fetchMore = React.useCallback(
		(options) => {
			const promise = queryRef.fetchMore(options);
			setPromise([queryRef.key, queryRef.promise]);
			return promise;
		},
		[queryRef],
	);
	const refetch = React.useCallback(
		(variables) => {
			const promise = queryRef.refetch(variables);
			setPromise([queryRef.key, queryRef.promise]);
			return promise;
		},
		[queryRef],
	);
	// TODO: The internalQueryRef doesn't have TVariables' type information so we have to cast it here
	const subscribeToMore = queryRef.observable.subscribeToMore;
	return React.useMemo(() => {
		return {
			client,
			data: result.data,
			dataState: result.dataState,
			error: result.error,
			networkStatus: result.networkStatus,
			fetchMore,
			refetch,
			subscribeToMore,
		};
	}, [client, fetchMore, refetch, result, subscribeToMore]);
}
export function useWatchQueryOptions({ client, query, options }) {
	return useDeepMemo(() => {
		if (options === skipToken) {
			return {
				query,
				fetchPolicy: 'standby',
				[variablesUnknownSymbol]: true,
			};
		}
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
		// Assign the updated fetch policy after our validation since `standby` is
		// not a supported fetch policy on its own without the use of `skip`.
		if (options.skip) {
			watchQueryOptions.fetchPolicy = 'standby';
		}
		return watchQueryOptions;
	}, [client, options, query]);
}
