import type { DataState, OperationVariables } from '@apollo/client';
import type { SubscribeToMoreFunction } from '@apollo/client';
import type { QueryRef } from '@octanejs/apollo-client/react';
import type { FetchMoreFunction, RefetchFunction } from '@octanejs/apollo-client/react/internal';
export declare namespace useQueryRefHandlers {
	interface Result<TData = unknown, TVariables extends OperationVariables = OperationVariables> {
		/**
		 * Update the variables of this observable query, and fetch the new results.
		 * This method should be preferred over `setVariables` in most use cases.
		 *
		 * Returns a `ResultPromise` with an additional `.retain()` method. Calling
		 * `.retain()` keeps the network operation running even if the `ObservableQuery`
		 * no longer requires the result.
		 *
		 * Note: `refetch()` guarantees that a value will be emitted from the
		 * observable, even if the result is deep equal to the previous value.
		 *
		 * @param variables - The new set of variables. If there are missing variables,
		 * the previous values of those variables will be used.
		 */
		refetch: RefetchFunction<TData, TVariables>;
		/**
		 * A function that helps you fetch the next set of results for a [paginated list field](https://www.apollographql.com/docs/react/pagination/core-api/).
		 */
		fetchMore: FetchMoreFunction<TData, TVariables>;
		/**
		 * A function that enables you to execute a [subscription](https://www.apollographql.com/docs/react/data/subscriptions/), usually to subscribe to specific fields that were included in the query.
		 *
		 * This function returns _another_ function that you can call to terminate the subscription.
		 */
		subscribeToMore: SubscribeToMoreFunction<TData, TVariables>;
	}
	namespace DocumentationTypes {
		/**
		 * A React hook that returns a `refetch` and `fetchMore` function for a given
		 * `queryRef`.
		 *
		 * This is useful to get access to handlers for a `queryRef` that was created by
		 * `createQueryPreloader` or when the handlers for a `queryRef` produced in
		 * a different component are inaccessible.
		 *
		 * @example
		 *
		 * ```tsx
		 * const MyComponent({ queryRef }) {
		 *   const { refetch, fetchMore } = useQueryRefHandlers(queryRef);
		 *
		 *   // ...
		 * }
		 * ```
		 *
		 * @param queryRef - A `QueryRef` returned from `useBackgroundQuery`, `useLoadableQuery`, or `createQueryPreloader`.
		 */
		function useQueryRefHandlers<
			TData = unknown,
			TVariables extends OperationVariables = OperationVariables,
		>(queryRef: QueryRef<TData, TVariables>): useQueryRefHandlers.Result<TData, TVariables>;
	}
}
/**
 * A React hook that returns a `refetch` and `fetchMore` function for a given
 * `queryRef`.
 *
 * This is useful to get access to handlers for a `queryRef` that was created by
 * `createQueryPreloader` or when the handlers for a `queryRef` produced in
 * a different component are inaccessible.
 *
 * @example
 *
 * ```tsx
 * const MyComponent({ queryRef }) {
 *   const { refetch, fetchMore } = useQueryRefHandlers(queryRef);
 *
 *   // ...
 * }
 * ```
 *
 * @param queryRef - A `QueryRef` returned from `useBackgroundQuery`, `useLoadableQuery`, or `createQueryPreloader`.
 */
export declare function useQueryRefHandlers<
	TData = unknown,
	TVariables extends OperationVariables = OperationVariables,
>(
	queryRef: QueryRef<TData, TVariables, DataState<TData>['dataState']>,
): useQueryRefHandlers.Result<TData, TVariables>;
