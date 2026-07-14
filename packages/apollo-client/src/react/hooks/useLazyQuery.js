import { equal } from '@wry/equality';
import * as React from 'octane';
import { NetworkStatus } from '@apollo/client';
import { maybeDeepFreeze, variablesUnknownSymbol } from '@apollo/client/utilities/internal';
import { invariant } from '@apollo/client/utilities/invariant';
import { useRenderGuard } from './internal/index.js';
import { isCompilerSite } from './internal/site.js';
import { useDeepMemo } from './internal/useDeepMemo.js';
import { useIsomorphicLayoutEffect } from './internal/useIsomorphicLayoutEffect.js';
import { useApolloClient } from './useApolloClient.js';
import { useSyncExternalStore } from './useSyncExternalStore.js';
// The following methods, when called will execute the query, regardless of
// whether the useLazyQuery execute function was called before.
const EAGER_METHODS = [
	'refetch',
	'fetchMore',
	'updateQuery',
	'startPolling',
	'stopPolling',
	'subscribeToMore',
];
export const useLazyQuery = function useLazyQuery(query, options) {
	if (isCompilerSite(options)) options = undefined;
	const client = useApolloClient(options?.client);
	const previousDataRef = React.useRef(undefined);
	const resultRef = React.useRef(undefined);
	const stableOptions = useDeepMemo(() => options, [options]);
	const calledDuringRender = useRenderGuard();
	function createObservable() {
		return client.watchQuery({
			...options,
			query,
			initialFetchPolicy: options?.fetchPolicy,
			fetchPolicy: 'standby',
			[variablesUnknownSymbol]: true,
		});
	}
	const [currentClient, setCurrentClient] = React.useState(client);
	const [observable, setObservable] = React.useState(createObservable);
	if (currentClient !== client) {
		setCurrentClient(client);
		setObservable(createObservable());
	}
	// TODO: Revisit after we have RxJS in place. We should be able to use
	// observable.getCurrentResult() (or equivalent) to get these values which
	// will hopefully alleviate the need for us to use refs to track these values.
	const updateResult = React.useCallback((result, forceUpdate) => {
		const previousData = resultRef.current?.data;
		if (previousData && !equal(previousData, result.data)) {
			previousDataRef.current = previousData;
		}
		resultRef.current = result;
		forceUpdate();
	}, []);
	const observableResult = useSyncExternalStore(
		React.useCallback(
			(forceUpdate) => {
				const subscription = observable.subscribe((result) => {
					if (!equal(resultRef.current, result)) {
						updateResult(result, forceUpdate);
					}
				});
				return () => {
					subscription.unsubscribe();
				};
			},
			[observable, updateResult],
		),
		() => resultRef.current || initialResult,
		() => initialResult,
	);
	// We use useMemo here to make sure the eager methods have a stable identity.
	const eagerMethods = React.useMemo(() => {
		const eagerMethods = {};
		for (const key of EAGER_METHODS) {
			eagerMethods[key] = function (...args) {
				invariant(resultRef.current, 29, key);
				// @ts-expect-error this is just to generic to type
				return observable[key](...args);
			};
		}
		return eagerMethods;
	}, [observable]);
	React.useEffect(() => {
		const updatedOptions = {
			query,
			errorPolicy: stableOptions?.errorPolicy,
			refetchOn: stableOptions?.refetchOn,
			refetchWritePolicy: stableOptions?.refetchWritePolicy,
			returnPartialData: stableOptions?.returnPartialData,
			notifyOnNetworkStatusChange: stableOptions?.notifyOnNetworkStatusChange,
			pollInterval: stableOptions?.pollInterval,
			nextFetchPolicy: options?.nextFetchPolicy,
			skipPollAttempt: options?.skipPollAttempt,
		};
		// Wait to apply the changed fetch policy until after the execute
		// function has been called. The execute function will handle setting the
		// the fetch policy away from standby for us when called for the first time.
		if (observable.options.fetchPolicy !== 'standby' && stableOptions?.fetchPolicy) {
			updatedOptions.fetchPolicy = stableOptions.fetchPolicy;
		}
		observable.applyOptions(updatedOptions);
	}, [
		query,
		observable,
		stableOptions,
		// Ensure inline functions don't suffer from stale closures by checking for
		// these deps separately. @wry/equality doesn't compare function identity
		// so `stableOptions` isn't updated when using inline functions.
		options?.nextFetchPolicy,
		options?.skipPollAttempt,
	]);
	const execute = React.useCallback(
		(...args) => {
			invariant(!calledDuringRender(), 30);
			const [executeOptions] = args;
			let fetchPolicy = observable.options.fetchPolicy;
			if (fetchPolicy === 'standby') {
				fetchPolicy = observable.options.initialFetchPolicy;
			}
			return observable.reobserve({
				fetchPolicy,
				// If `variables` is not given, reset back to empty variables by
				// ensuring the key exists in options
				variables: executeOptions?.variables,
				context: executeOptions?.context ?? {},
			});
		},
		[observable, calledDuringRender],
	);
	const executeRef = React.useRef(execute);
	useIsomorphicLayoutEffect(() => {
		executeRef.current = execute;
	}, null);
	const stableExecute = React.useCallback((...args) => executeRef.current(...args), []);
	const result = React.useMemo(() => {
		const { partial, ...result } = observableResult;
		return {
			...eagerMethods,
			...result,
			client,
			previousData: previousDataRef.current,
			variables: observable.variables,
			observable,
			called: !!resultRef.current,
		};
	}, [client, observableResult, eagerMethods, observable]);
	return [stableExecute, result];
};
const initialResult = maybeDeepFreeze({
	data: undefined,
	dataState: 'empty',
	loading: false,
	networkStatus: NetworkStatus.ready,
	partial: true,
});
