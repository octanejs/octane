import type { ApolloClient, DataState, ObservableQuery, OperationVariables } from '@apollo/client';
import { FragmentReference } from './FragmentReference.js';
import { InternalQueryReference } from './QueryReference.js';
import type { CacheKey, FragmentCacheKey } from './types.js';
export interface SuspenseCacheOptions {
	/**
	 * Specifies the amount of time, in milliseconds, the suspense cache will wait
	 * for a suspended component to read from the suspense cache before it
	 * automatically disposes of the query. This prevents memory leaks when a
	 * component unmounts before a suspended resource finishes loading. Increase
	 * the timeout if your queries take longer than than the specified time to
	 * prevent your queries from suspending over and over.
	 *
	 * Defaults to 30 seconds.
	 */
	autoDisposeTimeoutMs?: number;
}
export declare class SuspenseCache {
	private queryRefs;
	private fragmentRefs;
	private options;
	constructor(options?: SuspenseCacheOptions);
	getQueryRef<
		TData = unknown,
		TStates extends DataState<TData>['dataState'] = DataState<TData>['dataState'],
	>(
		cacheKey: CacheKey,
		createObservable: () => ObservableQuery<TData>,
	): InternalQueryReference<TData, TStates>;
	getFragmentRef<TData, TVariables extends OperationVariables>(
		cacheKey: FragmentCacheKey,
		client: ApolloClient,
		options: ApolloClient.WatchFragmentOptions<TData, TVariables> & {
			from: string | null | Array<string | null>;
		},
	): FragmentReference<TData, TVariables>;
	add(cacheKey: CacheKey, queryRef: InternalQueryReference<any, any>): void;
}
