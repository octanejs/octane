import * as React from 'octane';
import {
	assertWrappedQueryRef,
	getWrappedPromise,
	unwrapQueryRef,
	updateWrappedQueryRef,
} from '@octanejs/apollo-client/react/internal';
import { __use, wrapHook } from './internal/index.js';
import { useApolloClient } from './useApolloClient.js';
import { useSyncExternalStore } from './useSyncExternalStore.js';
/**
 * For a detailed explanation of `useReadQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense#avoiding-request-waterfalls).
 *
 * @param queryRef - The `QueryRef` that was generated via `useBackgroundQuery`.
 * @returns An object containing the query result data, error, and network status.
 *
 * @example
 *
 * ```jsx
 * import { Suspense } from "octane";
 * import { useBackgroundQuery, useReadQuery } from "@apollo/client";
 *
 * function Parent() {
 *   const [queryRef] = useBackgroundQuery(query);
 *
 *   return (
 *     <Suspense fallback={<div>Loading...</div>}>
 *       <Child queryRef={queryRef} />
 *     </Suspense>
 *   );
 * }
 *
 * function Child({ queryRef }) {
 *   const { data } = useReadQuery(queryRef);
 *
 *   return <div>{data.name}</div>;
 * }
 * ```
 */
export function useReadQuery(queryRef, site) {
	'use no memo';
	const unwrapped = unwrapQueryRef(queryRef);
	const clientOrObsQuery = useApolloClient(
		unwrapped
			? // passing an `ObservableQuery` is not supported by the types, but it will
				// return any truthy value that is passed in as an override so we cast the result
				unwrapped['observable']
			: undefined,
	);
	return wrapHook('useReadQuery', useReadQuery_, clientOrObsQuery)(queryRef, site);
}
function useReadQuery_(queryRef, site) {
	assertWrappedQueryRef(queryRef);
	const internalQueryRef = React.useMemo(() => unwrapQueryRef(queryRef), [queryRef]);
	const getPromise = React.useCallback(() => getWrappedPromise(queryRef), [queryRef]);
	if (internalQueryRef.disposed) {
		internalQueryRef.reinitialize();
		updateWrappedQueryRef(queryRef, internalQueryRef.promise);
	}
	React.useEffect(() => internalQueryRef.retain(), [internalQueryRef]);
	const promise = useSyncExternalStore(
		React.useCallback(
			(forceUpdate) => {
				return internalQueryRef.listen((promise) => {
					updateWrappedQueryRef(queryRef, promise);
					forceUpdate();
				});
			},
			[internalQueryRef, queryRef],
		),
		getPromise,
		getPromise,
	);
	const result = __use(promise, site);
	return React.useMemo(() => {
		return {
			data: result.data,
			dataState: result.dataState,
			networkStatus: result.networkStatus,
			error: result.error,
		};
	}, [result]);
}
