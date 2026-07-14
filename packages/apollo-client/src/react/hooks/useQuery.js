/**
 * Function parameters in this file try to follow a common order for the sake of
 * readability and consistency. The order is as follows:
 *
 * resultData
 * observable
 * client
 * query
 * options
 * watchQueryOptions
 * makeWatchQueryOptions
 */
/**  */
import { equal } from '@wry/equality';
import * as React from 'octane';
import { asapScheduler, observeOn } from 'rxjs';
import { NetworkStatus } from '@apollo/client';
import {
	maybeDeepFreeze,
	mergeOptions,
	variablesUnknownSymbol,
} from '@apollo/client/utilities/internal';
import { skipToken } from './constants.js';
import { useDeepMemo, wrapHook } from './internal/index.js';
import { isCompilerSite } from './internal/site.js';
import { useApolloClient } from './useApolloClient.js';
import { useSyncExternalStore } from './useSyncExternalStore.js';
const lastWatchOptions = Symbol();
export const useQuery = function useQuery(query, options) {
	'use no memo';
	if (isCompilerSite(options, skipToken)) options = undefined;
	return wrapHook(
		'useQuery',
		useQuery_,
		useApolloClient(typeof options === 'object' ? options.client : undefined),
	)(query, options);
};
function useQuery_(query, options = {}) {
	const client = useApolloClient(typeof options === 'object' ? options.client : undefined);
	const { ssr } = typeof options === 'object' ? options : {};
	const watchQueryOptions = useOptions(query, options, client.defaultOptions.watchQuery);
	function createState(previous) {
		const observable = client.watchQuery(watchQueryOptions);
		return {
			client,
			query,
			observable,
			resultData: {
				current: observable.getCurrentResult(),
				// Reuse previousData from previous InternalState (if any) to provide
				// continuity of previousData even if/when the query or client changes.
				previousData: previous?.resultData.current.data,
				variables: observable.variables,
			},
		};
	}
	let [state, setState] = React.useState(createState);
	if (client !== state.client || query !== state.query) {
		// If the client or query have changed, we need to create a new InternalState.
		// This will trigger a re-render with the new state, but it will also continue
		// to run the current render function to completion.
		// Since we sometimes trigger some side-effects in the render function, we
		// re-assign `state` to the new state to ensure that those side-effects are
		// triggered with the new state.
		setState((state = createState(state)));
	}
	const { observable, resultData } = state;
	useInitialFetchPolicyIfNecessary(watchQueryOptions, observable);
	useResubscribeIfNecessary(
		resultData, // might get mutated during render
		observable, // might get mutated during render
		watchQueryOptions,
	);
	const result = useResult(observable, resultData, ssr);
	const obsQueryFields = React.useMemo(
		() => ({
			refetch: observable.refetch.bind(observable),
			fetchMore: observable.fetchMore.bind(observable),
			updateQuery: observable.updateQuery.bind(observable),
			startPolling: observable.startPolling.bind(observable),
			stopPolling: observable.stopPolling.bind(observable),
			subscribeToMore: observable.subscribeToMore.bind(observable),
		}),
		[observable],
	);
	const previousData = resultData.previousData;
	return React.useMemo(() => {
		const { partial, ...rest } = result;
		return {
			...rest,
			client,
			observable,
			variables: observable.variables,
			previousData,
			...obsQueryFields,
		};
	}, [result, client, observable, previousData, obsQueryFields]);
}
const fromSkipToken = Symbol();
function useOptions(query, options, defaultOptions) {
	return useDeepMemo(() => {
		if (options === skipToken) {
			const opts = {
				...mergeOptions(defaultOptions, {
					query,
					fetchPolicy: 'standby',
				}),
				[variablesUnknownSymbol]: true,
			};
			opts[fromSkipToken] = true;
			return opts;
		}
		const watchQueryOptions = mergeOptions(defaultOptions, { ...options, query });
		if (options.skip) {
			watchQueryOptions.initialFetchPolicy = options.initialFetchPolicy || options.fetchPolicy;
			watchQueryOptions.fetchPolicy = 'standby';
		}
		return watchQueryOptions;
	}, [query, options, defaultOptions]);
}
function useInitialFetchPolicyIfNecessary(watchQueryOptions, observable) {
	'use no memo';
	if (!watchQueryOptions.fetchPolicy) {
		watchQueryOptions.fetchPolicy = observable.options.initialFetchPolicy;
	}
}
function useResult(observable, resultData, ssr) {
	'use no memo';
	const fetchPolicy = observable.options.fetchPolicy;
	return useSyncExternalStore(
		React.useCallback(
			(handleStoreChange) => {
				const subscription = observable
					// We use the asapScheduler here to prevent issues with trying to
					// update in the middle of a render. `reobserve` is kicked off in the
					// middle of a render and because RxJS emits values synchronously,
					// its possible for this `handleStoreChange` to be called in that same
					// render. This allows the render to complete before trying to emit a
					// new value.
					.pipe(observeOn(asapScheduler))
					.subscribe((result) => {
						const previous = resultData.current;
						if (
							// Avoid rerendering if the result is the same
							equal(previous, result) &&
							// Force rerender if the value was emitted because variables
							// changed, such as when calling `refetch(newVars)` which returns
							// the same data when `notifyOnNetworkStatusChange` is `false`.
							equal(resultData.variables, observable.variables)
						) {
							return;
						}
						resultData.variables = observable.variables;
						if (previous.data && !equal(previous.data, result.data)) {
							resultData.previousData = previous.data;
						}
						resultData.current = result;
						handleStoreChange();
					});
				// Do the "unsubscribe" with a short delay.
				// This way, an existing subscription can be reused without an additional
				// request if "unsubscribe"  and "resubscribe" to the same ObservableQuery
				// happen in very fast succession.
				return () => {
					setTimeout(() => subscription.unsubscribe());
				};
			},
			[observable, resultData],
		),
		() => resultData.current,
		() =>
			(fetchPolicy !== 'standby' && ssr === false) || fetchPolicy === 'no-cache'
				? useQuery.ssrDisabledResult
				: resultData.current,
	);
}
// this hook is not compatible with any rules of React, and there's no good way to rewrite it.
// it should stay a separate hook that will not be optimized by the compiler
function useResubscribeIfNecessary(
	/** this hook will mutate properties on `resultData` */
	resultData,
	/** this hook will mutate properties on `observable` */
	observable,
	watchQueryOptions,
) {
	'use no memo';
	if (observable[lastWatchOptions] && !equal(observable[lastWatchOptions], watchQueryOptions)) {
		// If skipToken was used to generate options, we won't know the correct
		// initialFetchPolicy until the hook is rerendered with real options, so we
		// set it the next time we get real options
		if (observable[lastWatchOptions][fromSkipToken] && !watchQueryOptions.initialFetchPolicy) {
			watchQueryOptions.initialFetchPolicy = watchQueryOptions.fetchPolicy;
		}
		// Though it might be tempting to postpone this reobserve call to the
		// useEffect block, we need getCurrentResult to return an appropriate
		// loading:true result synchronously (later within the same call to
		// useQuery). Since we already have this.observable here (not true for
		// the very first call to useQuery), we are not initiating any new
		// subscriptions, though it does feel less than ideal that reobserve
		// (potentially) kicks off a network request (for example, when the
		// variables have changed), which is technically a side-effect.
		if (shouldReobserve(observable[lastWatchOptions], watchQueryOptions)) {
			observable.reobserve(watchQueryOptions);
		} else {
			observable.applyOptions(watchQueryOptions);
		}
		// Make sure getCurrentResult returns a fresh ApolloQueryResult<TData>,
		// but save the current data as this.previousData, just like setResult
		// usually does.
		const result = observable.getCurrentResult();
		if (!equal(result.data, resultData.current.data)) {
			resultData.previousData = resultData.current.data || resultData.previousData;
		}
		resultData.current = result;
		resultData.variables = observable.variables;
	}
	observable[lastWatchOptions] = watchQueryOptions;
}
function shouldReobserve(previousOptions, options) {
	return (
		previousOptions.query !== options.query ||
		!equal(previousOptions.variables, options.variables) ||
		(previousOptions.fetchPolicy !== options.fetchPolicy &&
			(options.fetchPolicy === 'standby' || previousOptions.fetchPolicy === 'standby'))
	);
}
useQuery.ssrDisabledResult = maybeDeepFreeze({
	loading: true,
	data: void 0,
	dataState: 'empty',
	error: void 0,
	networkStatus: NetworkStatus.loading,
	partial: true,
});
