import type { DataState, ErrorLike, GetDataState, NetworkStatus } from '@apollo/client';
import type { MaybeMasked } from '@apollo/client/masking';
import type { QueryRef } from '@octanejs/apollo-client/react';
import type { DocumentationTypes as UtilityDocumentationTypes } from '@apollo/client/utilities/internal';
export declare namespace useReadQuery {
	namespace Base {
		interface Result<TData = unknown> {
			/**
			 * A single ErrorLike object describing the error that occurred during the latest
			 * query execution.
			 *
			 * For more information, see [Handling operation errors](https://www.apollographql.com/docs/react/data/error-handling/).
			 *
			 * @docGroup 1. Operation data
			 *
			 *
			 * This property can be ignored when using the default `errorPolicy` or an
			 * `errorPolicy` of `none`. The hook will throw the error instead of setting
			 * this property.
			 */
			error: ErrorLike | undefined;
			/**
			 * A number indicating the current network state of the query's associated request. [See possible values.](https://github.com/apollographql/apollo-client/blob/d96f4578f89b933c281bb775a39503f6cdb59ee8/src/core/networkStatus.ts#L4)
			 *
			 * Used in conjunction with the [`notifyOnNetworkStatusChange`](#notifyonnetworkstatuschange) option.
			 *
			 * @docGroup 2. Network info
			 */
			networkStatus: NetworkStatus;
		}
	}
	type Result<
		TData = unknown,
		TStates extends DataState<TData>['dataState'] = DataState<TData>['dataState'],
	> = Base.Result<TData> & GetDataState<MaybeMasked<TData>, TStates>;
	namespace DocumentationTypes {
		namespace useReadQuery {
			interface Result<TData = unknown>
				extends Base.Result<TData>, UtilityDocumentationTypes.DataState<TData> {}
		}
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
		function useReadQuery<TData>(queryRef: QueryRef<TData>): useReadQuery.Result<TData>;
	}
}
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
export declare function useReadQuery<TData, TStates extends DataState<TData>['dataState']>(
	queryRef: QueryRef<TData, any, TStates>,
): useReadQuery.Result<TData, TStates>;
