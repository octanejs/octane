import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { DocumentNode } from 'graphql';
import type {
	ApolloClient,
	DataState,
	DefaultContext,
	ErrorLike,
	ErrorPolicy,
	GetDataState,
	InternalTypes,
	MaybeMasked,
	ObservableQuery,
	OperationVariables,
	RefetchOn,
	RefetchWritePolicy,
	SubscribeToMoreFunction,
	UpdateQueryMapFn,
	WatchQueryFetchPolicy,
} from '@apollo/client';
import { NetworkStatus } from '@apollo/client';
import type {
	DocumentationTypes as UtilityDocumentationTypes,
	NoInfer,
	OptionWithFallback,
	SignatureStyle,
	VariablesOption,
} from '@apollo/client/utilities/internal';
export declare namespace useLazyQuery {
	import _self = useLazyQuery;
	interface Options<TData = unknown, TVariables extends OperationVariables = OperationVariables> {
		/**
		 * Specifies how the query interacts with the Apollo Client cache during execution (for example, whether it checks the cache for results before sending a request to the server).
		 *
		 * For details, see [Setting a fetch policy](https://www.apollographql.com/docs/react/data/queries/#setting-a-fetch-policy).
		 *
		 * The default value is `cache-first`.
		 *
		 * @docGroup 3. Caching options
		 */
		fetchPolicy?: WatchQueryFetchPolicy;
		/**
		 * Specifies the `FetchPolicy` to be used after this query has completed.
		 *
		 * @docGroup 3. Caching options
		 */
		nextFetchPolicy?:
			| WatchQueryFetchPolicy
			| ((
					this: ApolloClient.WatchQueryOptions<TData, TVariables>,
					currentFetchPolicy: WatchQueryFetchPolicy,
					context: InternalTypes.NextFetchPolicyContext<TData, TVariables>,
			  ) => WatchQueryFetchPolicy);
		/**
		 * Specifies whether a `NetworkStatus.refetch` operation should merge
		 * incoming field data with existing data, or overwrite the existing data.
		 * Overwriting is probably preferable, but merging is currently the default
		 * behavior, for backwards compatibility with Apollo Client 3.x.
		 *
		 * @docGroup 3. Caching options
		 */
		refetchWritePolicy?: RefetchWritePolicy;
		/**
		 * Specifies how the query handles a response that returns both GraphQL errors and partial results.
		 *
		 * For details, see [GraphQL error policies](https://www.apollographql.com/docs/react/data/error-handling/#graphql-error-policies).
		 *
		 * The default value is `none`, meaning that the query result includes error details but not partial results.
		 *
		 * @docGroup 1. Operation options
		 */
		errorPolicy?: ErrorPolicy;
		/**
		 * Specifies the interval (in milliseconds) at which the query polls for updated results.
		 *
		 * The default value is `0` (no polling).
		 *
		 * @docGroup 2. Networking options
		 */
		pollInterval?: number;
		/**
		 * If `true`, the in-progress query's associated component re-renders whenever the network status changes or a network error occurs.
		 *
		 * The default value is `true`.
		 *
		 * @docGroup 2. Networking options
		 */
		notifyOnNetworkStatusChange?: boolean;
		/**
		 * If `true`, the query can return partial results from the cache if the cache doesn't contain results for all queried fields.
		 *
		 * The default value is `false`.
		 *
		 * @docGroup 3. Caching options
		 */
		returnPartialData?: boolean;
		/**
		 * A callback function that's called whenever a refetch attempt occurs
		 * while polling. If the function returns `true`, the refetch is
		 * skipped and not reattempted until the next poll interval.
		 *
		 * @docGroup 2. Networking options
		 */
		skipPollAttempt?: () => boolean;
		/**
		 * The instance of `ApolloClient` to use to execute the query.
		 *
		 * By default, the instance that's passed down via context is used, but you
		 * can provide a different instance here.
		 *
		 * @docGroup 1. Operation options
		 */
		client?: ApolloClient;
		/**
		 * Determines whether events trigger refetches for the query. Provide an
		 * object mapping each refetch event to `true` (enable), `false` (disable)
		 * or a callback function that returns `true`/`false` to control individual
		 * events. Provide `false` to disable all automatic refetch events for this
		 * query. Provide `true` to enable all automatic refetch events for this query.
		 * Provide a callback function to perform additional logic to determine
		 * whether to enable or disable a refetch for a query.
		 *
		 * `@remarks`
		 * `refetchOn` inherits from `defaultOptions.watchQuery.refetchOn`. If
		 * `defaultOptions.watchQuery.refetchOn` is not set, all refetch events are
		 * enabled by default.
		 *
		 * This option only has an effect when the client is configured with a
		 * `refetchEventManager`.
		 * @docGroup 1. Operation options
		 */
		refetchOn?: RefetchOn.Option;
	}
	namespace DocumentationTypes {
		namespace useLazyQuery {
			interface Options<
				TData = unknown,
				TVariables extends OperationVariables = OperationVariables,
			> extends _self.Options<TData, TVariables> {}
		}
	}
	namespace Base {
		interface Result<TData, TVariables extends OperationVariables> {
			/**
			 * A function that instructs the query to begin re-executing at a specified interval (in milliseconds).
			 *
			 *
			 * @docGroup 3. Helper functions
			 */
			startPolling: (pollInterval: number) => void;
			/**
			 * A function that instructs the query to stop polling after a previous call to `startPolling`.
			 *
			 *
			 * @docGroup 3. Helper functions
			 */
			stopPolling: () => void;
			/**
			 * A function that enables you to execute a [subscription](https://www.apollographql.com/docs/react/data/subscriptions/), usually to subscribe to specific fields that were included in the query.
			 *
			 * This function returns _another_ function that you can call to terminate the subscription.
			 *
			 *
			 * @docGroup 3. Helper functions
			 */
			subscribeToMore: SubscribeToMoreFunction<TData, TVariables>;
			/**
			 * A function that enables you to update the query's cached result without executing a followup GraphQL operation.
			 *
			 * See [using updateQuery and updateFragment](https://www.apollographql.com/docs/react/caching/cache-interaction/#using-updatequery-and-updatefragment) for additional information.
			 *
			 *
			 * @docGroup 3. Helper functions
			 */
			updateQuery: (mapFn: UpdateQueryMapFn<TData, TVariables>) => void;
			/**
			 * A function that enables you to re-execute the query, optionally passing in new `variables`.
			 *
			 * To guarantee that the refetch performs a network request, its `fetchPolicy` is set to `network-only` (unless the original query's `fetchPolicy` is `no-cache` or `cache-and-network`, which also guarantee a network request).
			 *
			 * See also [Refetching](https://www.apollographql.com/docs/react/data/queries/#refetching).
			 *
			 * Returns a `ResultPromise` with an additional `.retain()` method. Calling
			 * `.retain()` keeps the network operation running even if the `ObservableQuery`
			 * no longer requires the result.
			 *
			 * @docGroup 3. Helper functions
			 */
			refetch: (
				variables?: Partial<TVariables>,
			) => Promise<ApolloClient.QueryResult<MaybeMasked<TData>>>;
			/**
			 * A function that helps you fetch the next set of results for a [paginated list field](https://www.apollographql.com/docs/react/pagination/core-api/).
			 *
			 *
			 * @docGroup 3. Helper functions
			 */
			fetchMore: <TFetchData = TData, TFetchVars extends OperationVariables = TVariables>(
				fetchMoreOptions: ObservableQuery.FetchMoreOptions<
					TData,
					TVariables,
					TFetchData,
					TFetchVars
				>,
			) => Promise<ApolloClient.QueryResult<MaybeMasked<TFetchData>>>;
			/**
			 * The instance of Apollo Client that executed the query.
			 * Can be useful for manually executing followup queries or writing data to the cache.
			 *
			 * @docGroup 2. Network info
			 */
			client: ApolloClient;
			/**
			 * A reference to the internal `ObservableQuery` used by the hook.
			 */
			observable: ObservableQuery<TData, TVariables>;
			/**
			 * An object containing the result from the most recent _previous_ execution of this query.
			 *
			 * This value is `undefined` if this is the query's first execution.
			 *
			 * @docGroup 1. Operation data
			 */
			previousData?: MaybeMasked<TData>;
			/**
			 * A single ErrorLike object describing the error that occurred during the latest
			 * query execution.
			 *
			 * For more information, see [Handling operation errors](https://www.apollographql.com/docs/react/data/error-handling/).
			 *
			 * @docGroup 1. Operation data
			 */
			error?: ErrorLike;
			/**
			 * If `true`, the query is still in flight.
			 *
			 * @docGroup 2. Network info
			 */
			loading: boolean;
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
		TData,
		TVariables extends OperationVariables,
		TStates extends DataState<TData>['dataState'] = DataState<TData>['dataState'],
	> = Base.Result<TData, TVariables> &
		(
			| ({
					/**
					 * If `true`, the associated lazy query has been executed.
					 *
					 * @docGroup 2. Network info
					 */
					called: true;
					/**
					 * An object containing the variables that were provided for the query.
					 *
					 * @docGroup 1. Operation data
					 */
					variables: TVariables;
			  } & GetDataState<MaybeMasked<TData>, TStates>)
			| {
					/**
					 * If `true`, the associated lazy query has been executed.
					 *
					 * @docGroup 2. Network info
					 */
					called: false;
					/**
					 * An object containing the variables that were provided for the query.
					 *
					 * @docGroup 1. Operation data
					 */
					variables: Partial<TVariables>;
					/**
					 * An object containing the result of your GraphQL query after it completes.
					 *
					 * This value might be `undefined` if a query results in one or more errors (depending on the query's `errorPolicy`).
					 *
					 * @docGroup 1. Operation data
					 */
					data: undefined;
					/**
					 * Describes the completeness of `data`.
					 *
					 * - `empty`: No data could be fulfilled from the cache or the result is
					 *   incomplete. `data` is `undefined`.
					 * - `partial`: Some data could be fulfilled from the cache but `data` is
					 *   incomplete. This is only possible when `returnPartialData` is `true`.
					 * - `streaming`: `data` is incomplete as a result of a deferred query and
					 *   the result is still streaming in.
					 * - `complete`: `data` is a fully satisfied query result fulfilled
					 *   either from the cache or network.
					 *
					 * @docGroup 1. Operation data
					 */
					dataState: 'empty';
			  }
		);
	namespace DocumentationTypes {
		namespace useLazyQuery {
			interface Result<TData, TVariables extends OperationVariables>
				extends
					Base.Result<TData, TVariables>,
					UtilityDocumentationTypes.DataState<TData>,
					UtilityDocumentationTypes.VariableOptions<TVariables> {
				/**
				 * If `true`, the associated lazy query has been executed.
				 *
				 * @docGroup 2. Network info
				 */
				called: boolean;
			}
		}
	}
	type ExecOptions<TVariables extends OperationVariables = OperationVariables> = {
		/**
		 * If you're using [Apollo Link](https://www.apollographql.com/docs/react/api/link/introduction/), this object is the initial value of the `context` object that's passed along your link chain.
		 *
		 * @docGroup 2. Networking options
		 */
		context?: DefaultContext;
	} & VariablesOption<TVariables>;
	namespace DocumentationTypes {
		namespace useLazyQuery {
			interface ExecOptions<
				TVariables extends OperationVariables,
			> extends UtilityDocumentationTypes.VariableOptions<TVariables> {
				/**
				 * If you're using [Apollo Link](https://www.apollographql.com/docs/react/api/link/introduction/), this object is the initial value of the `context` object that's passed along your link chain.
				 *
				 * @docGroup 2. Networking options
				 */
				context?: DefaultContext;
			}
		}
	}
	type ResultTuple<
		TData,
		TVariables extends OperationVariables,
		TStates extends DataState<TData>['dataState'] = DataState<TData>['dataState'],
	> = [
		execute: ExecFunction<TData, TVariables>,
		result: useLazyQuery.Result<TData, TVariables, TStates>,
	];
	type ExecFunction<TData, TVariables extends OperationVariables> = (
		...args: {} extends TVariables
			? [options?: useLazyQuery.ExecOptions<TVariables>]
			: [options: useLazyQuery.ExecOptions<TVariables>]
	) => ObservableQuery.ResultPromise<ApolloClient.QueryResult<TData>>;
	namespace DocumentationTypes {
		namespace useLazyQuery {
			export type { ResultTuple };
		}
	}
	interface DefaultOptions extends ApolloClient.DefaultOptions.WatchQuery.Calculated {}
	type ResultForOptions<
		TData,
		TVariables extends OperationVariables,
		TOptions extends Record<string, never> | Options<TData, TVariables>,
	> = ResultTuple<
		TData,
		TVariables,
		| 'complete'
		| 'streaming'
		| 'empty'
		| (OptionWithFallback<TOptions, DefaultOptions, 'returnPartialData'> extends false
				? never
				: 'partial')
	>;
	namespace DocumentationTypes {
		interface useLazyQuery {
			/**
			 * A hook for imperatively executing queries in an Apollo application, e.g. in response to user interaction.
			 *
			 * > Refer to the [Queries - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/queries#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLazyQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useLazyQuery } from "@octanejs/apollo-client/react";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function Hello() {
			 *   const [loadGreeting, { called, loading, data }] = useLazyQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (called && loading) return <p>Loading ...</p>;
			 *   if (!called) {
			 *     return <button onClick={() => loadGreeting()}>Load greeting</button>;
			 *   }
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Default options to control how the query is executed.
			 * @returns A tuple in the form of `[execute, result]`
			 */
			<TData = unknown, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useLazyQuery.Options<TData, TVariables>,
			): useLazyQuery.ResultTuple<TData, TVariables>;
		}
		interface useLazyQuery_Deprecated {
			/**
			 * @deprecated Avoid manually specifying generics on `useLazyQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for imperatively executing queries in an Apollo application, e.g. in response to user interaction.
			 *
			 * > Refer to the [Queries - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/queries#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLazyQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useLazyQuery } from "@octanejs/apollo-client/react";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function Hello() {
			 *   const [loadGreeting, { called, loading, data }] = useLazyQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (called && loading) return <p>Loading ...</p>;
			 *   if (!called) {
			 *     return <button onClick={() => loadGreeting()}>Load greeting</button>;
			 *   }
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Default options to control how the query is executed.
			 * @returns A tuple in the form of `[execute, result]`
			 */
			<TData = unknown, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useLazyQuery.Options<TData, TVariables>,
			): useLazyQuery.ResultTuple<TData, TVariables>;
		}
	}
	namespace Signatures {
		/**
		 * A hook for imperatively executing queries in an Apollo application, e.g. in response to user interaction.
		 *
		 * > Refer to the [Queries - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/queries#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLazyQuery`.
		 *
		 * @example
		 *
		 * ```jsx
		 * import { gql } from "@apollo/client";
		 * import { useLazyQuery } from "@octanejs/apollo-client/react";
		 *
		 * const GET_GREETING = gql`
		 *   query GetGreeting($language: String!) {
		 *     greeting(language: $language) {
		 *       message
		 *     }
		 *   }
		 * `;
		 *
		 * function Hello() {
		 *   const [loadGreeting, { called, loading, data }] = useLazyQuery(GET_GREETING, {
		 *     variables: { language: "english" },
		 *   });
		 *   if (called && loading) return <p>Loading ...</p>;
		 *   if (!called) {
		 *     return <button onClick={() => loadGreeting()}>Load greeting</button>;
		 *   }
		 *   return <h1>Hello {data.greeting.message}!</h1>;
		 * }
		 * ```
		 *
		 * @param query - A GraphQL query document parsed into an AST by `gql`.
		 * @param options - Default options to control how the query is executed.
		 * @returns A tuple in the form of `[execute, result]`
		 */
		interface Classic {
			/**
			 * A hook for imperatively executing queries in an Apollo application, e.g. in response to user interaction.
			 *
			 * > Refer to the [Queries - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/queries#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLazyQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useLazyQuery } from "@octanejs/apollo-client/react";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function Hello() {
			 *   const [loadGreeting, { called, loading, data }] = useLazyQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (called && loading) return <p>Loading ...</p>;
			 *   if (!called) {
			 *     return <button onClick={() => loadGreeting()}>Load greeting</button>;
			 *   }
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Default options to control how the query is executed.
			 * @returns A tuple in the form of `[execute, result]`
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useLazyQuery.Options<NoInfer<TData>, NoInfer<TVariables>> & {
					returnPartialData: true;
				},
			): useLazyQuery.ResultTuple<
				TData,
				TVariables,
				'empty' | 'complete' | 'streaming' | 'partial'
			>;
			/**
			 * A hook for imperatively executing queries in an Apollo application, e.g. in response to user interaction.
			 *
			 * > Refer to the [Queries - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/queries#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLazyQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useLazyQuery } from "@octanejs/apollo-client/react";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function Hello() {
			 *   const [loadGreeting, { called, loading, data }] = useLazyQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (called && loading) return <p>Loading ...</p>;
			 *   if (!called) {
			 *     return <button onClick={() => loadGreeting()}>Load greeting</button>;
			 *   }
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Default options to control how the query is executed.
			 * @returns A tuple in the form of `[execute, result]`
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useLazyQuery.Options<NoInfer<TData>, NoInfer<TVariables>> & {
					returnPartialData: boolean;
				},
			): useLazyQuery.ResultTuple<
				TData,
				TVariables,
				'empty' | 'complete' | 'streaming' | 'partial'
			>;
			/**
			 * A hook for imperatively executing queries in an Apollo application, e.g. in response to user interaction.
			 *
			 * > Refer to the [Queries - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/queries#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLazyQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useLazyQuery } from "@octanejs/apollo-client/react";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function Hello() {
			 *   const [loadGreeting, { called, loading, data }] = useLazyQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (called && loading) return <p>Loading ...</p>;
			 *   if (!called) {
			 *     return <button onClick={() => loadGreeting()}>Load greeting</button>;
			 *   }
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Default options to control how the query is executed.
			 * @returns A tuple in the form of `[execute, result]`
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options?: useLazyQuery.Options<NoInfer<TData>, NoInfer<TVariables>>,
			): useLazyQuery.ResultTuple<TData, TVariables, 'empty' | 'complete' | 'streaming'>;
			/**
			 * @deprecated Avoid manually specifying generics on `useLazyQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for imperatively executing queries in an Apollo application, e.g. in response to user interaction.
			 *
			 * > Refer to the [Queries - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/queries#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLazyQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useLazyQuery } from "@octanejs/apollo-client/react";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function Hello() {
			 *   const [loadGreeting, { called, loading, data }] = useLazyQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (called && loading) return <p>Loading ...</p>;
			 *   if (!called) {
			 *     return <button onClick={() => loadGreeting()}>Load greeting</button>;
			 *   }
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Default options to control how the query is executed.
			 * @returns A tuple in the form of `[execute, result]`
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useLazyQuery.Options<NoInfer<TData>, NoInfer<TVariables>> & {
					returnPartialData: true;
				},
			): useLazyQuery.ResultTuple<
				TData,
				TVariables,
				'empty' | 'complete' | 'streaming' | 'partial'
			>;
			/**
			 * @deprecated Avoid manually specifying generics on `useLazyQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for imperatively executing queries in an Apollo application, e.g. in response to user interaction.
			 *
			 * > Refer to the [Queries - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/queries#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLazyQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useLazyQuery } from "@octanejs/apollo-client/react";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function Hello() {
			 *   const [loadGreeting, { called, loading, data }] = useLazyQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (called && loading) return <p>Loading ...</p>;
			 *   if (!called) {
			 *     return <button onClick={() => loadGreeting()}>Load greeting</button>;
			 *   }
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Default options to control how the query is executed.
			 * @returns A tuple in the form of `[execute, result]`
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useLazyQuery.Options<NoInfer<TData>, NoInfer<TVariables>> & {
					returnPartialData: boolean;
				},
			): useLazyQuery.ResultTuple<
				TData,
				TVariables,
				'empty' | 'complete' | 'streaming' | 'partial'
			>;
			/**
			 * @deprecated Avoid manually specifying generics on `useLazyQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for imperatively executing queries in an Apollo application, e.g. in response to user interaction.
			 *
			 * > Refer to the [Queries - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/queries#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLazyQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useLazyQuery } from "@octanejs/apollo-client/react";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function Hello() {
			 *   const [loadGreeting, { called, loading, data }] = useLazyQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (called && loading) return <p>Loading ...</p>;
			 *   if (!called) {
			 *     return <button onClick={() => loadGreeting()}>Load greeting</button>;
			 *   }
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Default options to control how the query is executed.
			 * @returns A tuple in the form of `[execute, result]`
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options?: useLazyQuery.Options<NoInfer<TData>, NoInfer<TVariables>>,
			): useLazyQuery.ResultTuple<TData, TVariables, 'empty' | 'complete' | 'streaming'>;
		}
		/**
		 * A hook for imperatively executing queries in an Apollo application, e.g. in response to user interaction.
		 *
		 * > Refer to the [Queries - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/queries#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLazyQuery`.
		 *
		 * @example
		 *
		 * ```jsx
		 * import { gql } from "@apollo/client";
		 * import { useLazyQuery } from "@octanejs/apollo-client/react";
		 *
		 * const GET_GREETING = gql`
		 *   query GetGreeting($language: String!) {
		 *     greeting(language: $language) {
		 *       message
		 *     }
		 *   }
		 * `;
		 *
		 * function Hello() {
		 *   const [loadGreeting, { called, loading, data }] = useLazyQuery(GET_GREETING, {
		 *     variables: { language: "english" },
		 *   });
		 *   if (called && loading) return <p>Loading ...</p>;
		 *   if (!called) {
		 *     return <button onClick={() => loadGreeting()}>Load greeting</button>;
		 *   }
		 *   return <h1>Hello {data.greeting.message}!</h1>;
		 * }
		 * ```
		 *
		 * @param query - A GraphQL query document parsed into an AST by `gql`.
		 * @param options - Default options to control how the query is executed.
		 * @returns A tuple in the form of `[execute, result]`
		 */
		interface Modern {
			/**
			 * A hook for imperatively executing queries in an Apollo application, e.g. in response to user interaction.
			 *
			 * > Refer to the [Queries - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/queries#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLazyQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useLazyQuery } from "@octanejs/apollo-client/react";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function Hello() {
			 *   const [loadGreeting, { called, loading, data }] = useLazyQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (called && loading) return <p>Loading ...</p>;
			 *   if (!called) {
			 *     return <button onClick={() => loadGreeting()}>Load greeting</button>;
			 *   }
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Default options to control how the query is executed.
			 * @returns A tuple in the form of `[execute, result]`
			 */
			<TData, TVariables extends OperationVariables, TOptions extends never>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
			): useLazyQuery.ResultForOptions<TData, TVariables, Record<string, never>>;
			/**
			 * A hook for imperatively executing queries in an Apollo application, e.g. in response to user interaction.
			 *
			 * > Refer to the [Queries - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/queries#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLazyQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useLazyQuery } from "@octanejs/apollo-client/react";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function Hello() {
			 *   const [loadGreeting, { called, loading, data }] = useLazyQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (called && loading) return <p>Loading ...</p>;
			 *   if (!called) {
			 *     return <button onClick={() => loadGreeting()}>Load greeting</button>;
			 *   }
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Default options to control how the query is executed.
			 * @returns A tuple in the form of `[execute, result]`
			 */
			<
				TData,
				TVariables extends OperationVariables,
				TOptions extends useLazyQuery.Options<NoInfer<TData>, NoInfer<TVariables>> & {
					variables?: {
						[K in Exclude<keyof TOptions['variables'], keyof TVariables>]?: never;
					};
				},
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options?: TOptions,
			): useLazyQuery.ResultForOptions<TData, TVariables, TOptions>;
		}
		type Evaluated = SignatureStyle extends 'classic' ? Classic : Modern;
	}
	/**
	 * A hook for imperatively executing queries in an Apollo application, e.g. in response to user interaction.
	 *
	 * > Refer to the [Queries - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/queries#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLazyQuery`.
	 *
	 * @example
	 *
	 * ```jsx
	 * import { gql } from "@apollo/client";
	 * import { useLazyQuery } from "@octanejs/apollo-client/react";
	 *
	 * const GET_GREETING = gql`
	 *   query GetGreeting($language: String!) {
	 *     greeting(language: $language) {
	 *       message
	 *     }
	 *   }
	 * `;
	 *
	 * function Hello() {
	 *   const [loadGreeting, { called, loading, data }] = useLazyQuery(GET_GREETING, {
	 *     variables: { language: "english" },
	 *   });
	 *   if (called && loading) return <p>Loading ...</p>;
	 *   if (!called) {
	 *     return <button onClick={() => loadGreeting()}>Load greeting</button>;
	 *   }
	 *   return <h1>Hello {data.greeting.message}!</h1>;
	 * }
	 * ```
	 *
	 * @param query - A GraphQL query document parsed into an AST by `gql`.
	 * @param options - Default options to control how the query is executed.
	 * @returns A tuple in the form of `[execute, result]`
	 */
	interface Signature extends Signatures.Evaluated {}
}
export declare const useLazyQuery: useLazyQuery.Signature;
