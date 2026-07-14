import type {
	DocumentTypeDecoration,
	ResultOf,
	VariablesOf,
} from '@graphql-typed-document-node/core';
import type { ApolloClient, DataState, ObservableQuery, OperationVariables } from '@apollo/client';
import type { MaybeMasked } from '@apollo/client/masking';
import type { DecoratedPromise } from '@apollo/client/utilities/internal';
import type { QueryKey } from './types.js';
type QueryRefPromise<TData, TStates extends DataState<TData>['dataState']> = DecoratedPromise<
	ObservableQuery.Result<MaybeMasked<TData>, TStates>
>;
type Listener<TData, TStates extends DataState<TData>['dataState']> = (
	promise: QueryRefPromise<TData, TStates>,
) => void;
declare const QUERY_REFERENCE_SYMBOL: unique symbol;
declare const PROMISE_SYMBOL: unique symbol;
declare const QUERY_REF_BRAND: unique symbol;
declare const PRELOADED_QUERY_REF_BRAND: unique symbol;
/**
 * A `QueryReference` is an opaque object returned by `useBackgroundQuery`.
 * A child component reading the `QueryReference` via `useReadQuery` will
 * suspend until the promise resolves.
 */
export interface QueryRef<
	TData = unknown,
	TVariables extends OperationVariables = OperationVariables,
	TStates extends DataState<TData>['dataState'] = 'complete' | 'streaming',
> {
	/**
	 * @internal
	 *
	 * @deprecated This is an internal API and should not be used directly. This can be removed or changed at any time.
	 */
	[QUERY_REF_BRAND]?(variables: TVariables): {
		data: TData;
		states: TStates;
	};
}
export declare namespace QueryRef {
	type ForQuery<
		Document extends DocumentTypeDecoration<any, any>,
		TStates extends DataState<ResultOf<Document>>['dataState'] = 'complete' | 'streaming',
	> = QueryRef<ResultOf<Document>, VariablesOf<Document>, TStates>;
}
/**
 * @internal
 * For usage in internal helpers only.
 *
 * @deprecated This is an internal API and should not be used directly. This can be removed or changed at any time.
 */
interface WrappedQueryRef<
	TData = unknown,
	TVariables extends OperationVariables = OperationVariables,
	TStates extends DataState<TData>['dataState'] = 'complete' | 'streaming',
> extends QueryRef<TData, TVariables, TStates> {
	/**
	 * @internal
	 *
	 * @deprecated This is an internal API and should not be used directly. This can be removed or changed at any time.
	 */
	readonly [QUERY_REFERENCE_SYMBOL]: InternalQueryReference<TData, TStates>;
	/**
	 * @internal
	 *
	 * @deprecated This is an internal API and should not be used directly. This can be removed or changed at any time.
	 */
	[PROMISE_SYMBOL]: QueryRefPromise<TData, TStates>;
}
/**
 * A `QueryReference` is an opaque object returned by `useBackgroundQuery`.
 * A child component reading the `QueryReference` via `useReadQuery` will
 * suspend until the promise resolves.
 */
export interface PreloadedQueryRef<
	TData = unknown,
	TVariables extends OperationVariables = OperationVariables,
	TStates extends DataState<TData>['dataState'] = 'complete' | 'streaming',
> extends QueryRef<TData, TVariables, TStates> {
	/**
	 * @internal
	 *
	 * @deprecated This is an internal API and should not be used directly. This can be removed or changed at any time.
	 */
	[PRELOADED_QUERY_REF_BRAND]: typeof PRELOADED_QUERY_REF_BRAND;
}
interface InternalQueryReferenceOptions {
	onDispose?: () => void;
	autoDisposeTimeoutMs?: number;
}
export declare function wrapQueryRef<
	TData,
	TVariables extends OperationVariables,
	TStates extends DataState<TData>['dataState'],
>(
	internalQueryRef: InternalQueryReference<TData, TStates>,
): WrappedQueryRef<TData, TVariables, TStates>;
export declare function assertWrappedQueryRef<
	TData,
	TVariables extends OperationVariables,
	TStates extends DataState<TData>['dataState'],
>(
	queryRef: QueryRef<TData, TVariables, TStates>,
): asserts queryRef is WrappedQueryRef<TData, TVariables, TStates>;
export declare function assertWrappedQueryRef<
	TData,
	TVariables extends OperationVariables,
	TStates extends DataState<TData>['dataState'],
>(
	queryRef: QueryRef<TData, TVariables, TStates> | undefined | null,
): asserts queryRef is WrappedQueryRef<TData, TVariables, TStates> | undefined | null;
export declare function getWrappedPromise<TData, TStates extends DataState<TData>['dataState']>(
	queryRef: WrappedQueryRef<TData, any, TStates>,
): QueryRefPromise<TData, TStates>;
export declare function unwrapQueryRef<TData, TStates extends DataState<TData>['dataState']>(
	queryRef: WrappedQueryRef<TData, any, TStates>,
): InternalQueryReference<TData, TStates>;
export declare function unwrapQueryRef<TData, TStates extends DataState<TData>['dataState']>(
	queryRef: Partial<WrappedQueryRef<TData, any, TStates>>,
): undefined | InternalQueryReference<TData, TStates>;
export declare function updateWrappedQueryRef<TData, TStates extends DataState<TData>['dataState']>(
	queryRef: WrappedQueryRef<TData, any, TStates>,
	promise: QueryRefPromise<TData, TStates>,
): void;
declare const OBSERVED_CHANGED_OPTIONS: readonly [
	'context',
	'errorPolicy',
	'fetchPolicy',
	'refetchOn',
	'refetchWritePolicy',
	'returnPartialData',
];
type ObservedOptions = Pick<
	ApolloClient.WatchQueryOptions,
	(typeof OBSERVED_CHANGED_OPTIONS)[number]
>;
export declare class InternalQueryReference<
	TData = unknown,
	TStates extends DataState<TData>['dataState'] = DataState<TData>['dataState'],
> {
	result: ObservableQuery.Result<MaybeMasked<TData>, TStates>;
	readonly key: QueryKey;
	readonly observable: ObservableQuery<TData>;
	promise: QueryRefPromise<TData, TStates>;
	private queue;
	private subscription;
	private listeners;
	private autoDisposeTimeoutId?;
	private resolve;
	private reject;
	private references;
	private softReferences;
	constructor(observable: ObservableQuery<TData, any>, options: InternalQueryReferenceOptions);
	get disposed(): boolean;
	get watchQueryOptions(): ObservableQuery.Options<TData, OperationVariables>;
	reinitialize(): void;
	retain(): () => void;
	softRetain(): () => void;
	didChangeOptions(watchQueryOptions: ObservedOptions): boolean;
	applyOptions(watchQueryOptions: ObservedOptions): QueryRefPromise<TData, TStates>;
	listen(listener: Listener<TData, TStates>): () => void;
	refetch(variables: OperationVariables | undefined): Promise<{
		data: TData | undefined;
		error?: import('@apollo/client').ErrorLike;
	}>;
	fetchMore(options: ObservableQuery.FetchMoreOptions<TData, any, any, any>): Promise<{
		data: TData | undefined;
		error?: import('@apollo/client').ErrorLike;
	}>;
	private dispose;
	private onDispose;
	private handleNext;
	private deliver;
	private initiateFetch;
	private subscribeToQuery;
	private setResult;
	private shouldReject;
	private createPendingPromise;
}
export {};
