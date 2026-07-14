import type {
	DataState,
	DefaultContext,
	DocumentNode,
	ErrorLike,
	ErrorPolicy,
	GetDataState,
	InternalTypes,
	ObservableQuery,
	OperationVariables,
	RefetchOn,
	RefetchWritePolicy,
	SubscribeToMoreFunction,
	TypedDocumentNode,
	UpdateQueryMapFn,
	WatchQueryFetchPolicy,
} from '@apollo/client';
import type { ApolloClient } from '@apollo/client';
import { NetworkStatus } from '@apollo/client';
import type { MaybeMasked } from '@apollo/client/masking';
import type {
	DocumentationTypes as UtilityDocumentationTypes,
	LazyType,
	NoInfer,
	OptionWithFallback,
	SignatureStyle,
	VariablesOption,
} from '@apollo/client/utilities/internal';
import type { SkipToken } from './constants.js';
export declare namespace useQuery {
	namespace Base {
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
			 * Defaults to the initial value of options.fetchPolicy, but can be explicitly
			 * configured to specify the WatchQueryFetchPolicy to revert back to whenever
			 * variables change (unless nextFetchPolicy intervenes).
			 *
			 * @docGroup 3. Caching options
			 */
			initialFetchPolicy?: WatchQueryFetchPolicy;
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
			 * Pass `false` to skip executing the query during [server-side rendering](https://www.apollographql.com/docs/react/performance/server-side-rendering/).
			 *
			 * @docGroup 2. Networking options
			 */
			ssr?: boolean;
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
			 * If you're using [Apollo Link](https://www.apollographql.com/docs/react/api/link/introduction/), this object is the initial value of the `context` object that's passed along your link chain.
			 *
			 * @docGroup 2. Networking options
			 */
			context?: DefaultContext;
			/**
			 * If true, the query is not executed.
			 *
			 * The default value is `false`.
			 *
			 * @docGroup 1. Operation options
			 */
			skip?: boolean;
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
	}
	type Options<
		TData = unknown,
		TVariables extends OperationVariables = OperationVariables,
	> = Base.Options<TData, TVariables> & VariablesOption<TVariables>;
	namespace DocumentationTypes {
		namespace useQuery {
			interface Options<TData = unknown, TVariables extends OperationVariables = OperationVariables>
				extends
					Base.Options<TData, TVariables>,
					UtilityDocumentationTypes.VariableOptions<TVariables> {}
		}
	}
	namespace Base {
		interface Result<
			TData = unknown,
			TVariables extends OperationVariables = OperationVariables,
			TReturnVariables extends OperationVariables = TVariables,
		> {
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
			 * An object containing the variables that were provided for the query.
			 *
			 * @docGroup 1. Operation data
			 */
			variables: TReturnVariables;
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
		}
	}
	type Result<
		TData = unknown,
		TVariables extends OperationVariables = OperationVariables,
		TStates extends DataState<TData>['dataState'] = DataState<TData>['dataState'],
		TReturnVariables extends OperationVariables = TVariables,
	> = Base.Result<TData, TVariables, TReturnVariables> & GetDataState<MaybeMasked<TData>, TStates>;
	interface DefaultOptions extends ApolloClient.DefaultOptions.WatchQuery.Calculated {
		skip: false;
	}
	type ResultForOptions<
		TData,
		TVariables extends OperationVariables,
		TOptions extends Record<string, never> | Options<TData, TVariables> | SkipToken,
	> = LazyType<
		Result<
			TData,
			TVariables,
			| 'complete'
			| 'streaming'
			| 'empty'
			| (TOptions extends any
					? TOptions extends SkipToken
						? never
						: OptionWithFallback<TOptions, DefaultOptions, 'returnPartialData'> extends false
							? never
							: 'partial'
					: never)
		>
	>;
	namespace DocumentationTypes {
		namespace useQuery {
			interface Result<TData = unknown, TVariables extends OperationVariables = OperationVariables>
				extends Base.Result<TData, TVariables>, UtilityDocumentationTypes.DataState<TData> {}
		}
	}
	namespace DocumentationTypes {
		interface useQuery {
			/**
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<TData = unknown, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useQuery.Options<TData, TVariables>,
			): useQuery.Result<TData, TVariables>;
		}
		interface useQuery_Deprecated {
			/**
			 * @deprecated Avoid manually specifying generics on `useQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<TData = unknown, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useQuery.Options<TData, TVariables>,
			): useQuery.Result<TData, TVariables>;
		}
	}
	namespace Signatures {
		/**
		 * A hook for executing queries in an Apollo application.
		 *
		 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
		 *
		 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
		 *
		 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
		 *
		 * @example
		 *
		 * ```jsx
		 * import { gql } from "@apollo/client";
		 * import { useQuery } from "@octanejs/apollo-client/react";
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
		 *   const { loading, error, data } = useQuery(GET_GREETING, {
		 *     variables: { language: "english" },
		 *   });
		 *   if (loading) return <p>Loading ...</p>;
		 *   return <h1>Hello {data.greeting.message}!</h1>;
		 * }
		 * ```
		 *
		 * @param query - A GraphQL query document parsed into an AST by `gql`.
		 * @param options - Options to control how the query is executed.
		 * @returns Query result object
		 */
		interface Classic {
			/**
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useQuery.Options<NoInfer<TData>, NoInfer<TVariables>> & {
					returnPartialData: true;
				},
			): useQuery.Result<TData, TVariables, 'empty' | 'complete' | 'streaming' | 'partial'>;
			/**
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: SkipToken,
			): useQuery.Result<TData, TVariables, 'empty', Record<string, never>>;
			/**
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options:
					| SkipToken
					| (useQuery.Options<NoInfer<TData>, NoInfer<TVariables>> & {
							returnPartialData: true;
					  }),
			): useQuery.Result<
				TData,
				TVariables,
				'empty' | 'complete' | 'streaming' | 'partial',
				Partial<TVariables>
			>;
			/**
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useQuery.Options<NoInfer<TData>, NoInfer<TVariables>> & {
					returnPartialData: boolean;
				},
			): useQuery.Result<TData, TVariables, 'empty' | 'complete' | 'streaming' | 'partial'>;
			/**
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options:
					| SkipToken
					| (useQuery.Options<NoInfer<TData>, NoInfer<TVariables>> & {
							returnPartialData: boolean;
					  }),
			): useQuery.Result<
				TData,
				TVariables,
				'empty' | 'complete' | 'streaming' | 'partial',
				Partial<TVariables>
			>;
			/**
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: useQuery.Options<NoInfer<TData>, NoInfer<TVariables>>]
					: [options: useQuery.Options<NoInfer<TData>, NoInfer<TVariables>>]
			): useQuery.Result<TData, TVariables, 'empty' | 'complete' | 'streaming'>;
			/**
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: SkipToken | useQuery.Options<NoInfer<TData>, NoInfer<TVariables>>]
					: [options: SkipToken | useQuery.Options<NoInfer<TData>, NoInfer<TVariables>>]
			): useQuery.Result<
				TData,
				TVariables,
				'empty' | 'complete' | 'streaming',
				Partial<TVariables>
			>;
			/**
			 * @deprecated Avoid manually specifying generics on `useQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useQuery.Options<NoInfer<TData>, NoInfer<TVariables>> & {
					returnPartialData: true;
				},
			): useQuery.Result<TData, TVariables, 'empty' | 'complete' | 'streaming' | 'partial'>;
			/**
			 * @deprecated Avoid manually specifying generics on `useQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: SkipToken,
			): useQuery.Result<TData, TVariables, 'empty', Record<string, never>>;
			/**
			 * @deprecated Avoid manually specifying generics on `useQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options:
					| SkipToken
					| (useQuery.Options<NoInfer<TData>, NoInfer<TVariables>> & {
							returnPartialData: true;
					  }),
			): useQuery.Result<
				TData,
				TVariables,
				'empty' | 'complete' | 'streaming' | 'partial',
				Partial<TVariables>
			>;
			/**
			 * @deprecated Avoid manually specifying generics on `useQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useQuery.Options<NoInfer<TData>, NoInfer<TVariables>> & {
					returnPartialData: boolean;
				},
			): useQuery.Result<TData, TVariables, 'empty' | 'complete' | 'streaming' | 'partial'>;
			/**
			 * @deprecated Avoid manually specifying generics on `useQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options:
					| SkipToken
					| (useQuery.Options<NoInfer<TData>, NoInfer<TVariables>> & {
							returnPartialData: boolean;
					  }),
			): useQuery.Result<
				TData,
				TVariables,
				'empty' | 'complete' | 'streaming' | 'partial',
				Partial<TVariables>
			>;
			/**
			 * @deprecated Avoid manually specifying generics on `useQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: useQuery.Options<NoInfer<TData>, NoInfer<TVariables>>]
					: [options: useQuery.Options<NoInfer<TData>, NoInfer<TVariables>>]
			): useQuery.Result<TData, TVariables, 'empty' | 'complete' | 'streaming'>;
			/**
			 * @deprecated Avoid manually specifying generics on `useQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: SkipToken | useQuery.Options<NoInfer<TData>, NoInfer<TVariables>>]
					: [options: SkipToken | useQuery.Options<NoInfer<TData>, NoInfer<TVariables>>]
			): useQuery.Result<
				TData,
				TVariables,
				'empty' | 'complete' | 'streaming',
				Partial<TVariables>
			>;
			ssrDisabledResult: ObservableQuery.Result<any>;
		}
		/**
		 * A hook for executing queries in an Apollo application.
		 *
		 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
		 *
		 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
		 *
		 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
		 *
		 * @example
		 *
		 * ```jsx
		 * import { gql } from "@apollo/client";
		 * import { useQuery } from "@octanejs/apollo-client/react";
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
		 *   const { loading, error, data } = useQuery(GET_GREETING, {
		 *     variables: { language: "english" },
		 *   });
		 *   if (loading) return <p>Loading ...</p>;
		 *   return <h1>Hello {data.greeting.message}!</h1>;
		 * }
		 * ```
		 *
		 * @param query - A GraphQL query document parsed into an AST by `gql`.
		 * @param options - Options to control how the query is executed.
		 * @returns Query result object
		 */
		interface Modern {
			/**
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<TData, TVariables extends OperationVariables, Options extends never>(
				query: {} extends TVariables ? DocumentNode | TypedDocumentNode<TData, TVariables> : never,
			): useQuery.ResultForOptions<TData, TVariables, Record<string, never>>;
			/**
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<
				TData,
				TVariables extends OperationVariables,
				TOptions extends useQuery.Options<TData, NoInfer<TVariables>> &
					VariablesOption<
						TVariables & {
							[K in Exclude<keyof TOptions['variables'], keyof TVariables>]?: never;
						}
					>,
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: [TVariables] extends [never]
					? [options: never]
					: {} extends TVariables
						? [options?: TOptions]
						: [options: TOptions]
			): useQuery.ResultForOptions<TData, TVariables, TOptions>;
			/**
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<TData, TVariables extends OperationVariables, TOptions extends SkipToken>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: SkipToken,
			): useQuery.Result<TData, TVariables, 'empty', Record<string, never>>;
			/**
			 * A hook for executing queries in an Apollo application.
			 *
			 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
			 *
			 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
			 *
			 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql } from "@apollo/client";
			 * import { useQuery } from "@octanejs/apollo-client/react";
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
			 *   const { loading, error, data } = useQuery(GET_GREETING, {
			 *     variables: { language: "english" },
			 *   });
			 *   if (loading) return <p>Loading ...</p>;
			 *   return <h1>Hello {data.greeting.message}!</h1>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns Query result object
			 */
			<
				TData,
				TVariables extends OperationVariables,
				TOptions extends useQuery.Options<TData, NoInfer<TVariables>> &
					VariablesOption<
						TVariables & {
							[K in Exclude<keyof TOptions['variables'], keyof TVariables>]?: never;
						}
					>,
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: [TVariables] extends [never]
					? [options: never]
					: {} extends TVariables
						? [options?: TOptions | SkipToken]
						: [options: TOptions | SkipToken]
			): useQuery.ResultForOptions<TData, TVariables, TOptions | SkipToken>;
			ssrDisabledResult: ObservableQuery.Result<any>;
		}
		type Evaluated = SignatureStyle extends 'classic' ? Classic : Modern;
	}
	/**
	 * A hook for executing queries in an Apollo application.
	 *
	 * To run a query within a React component, call `useQuery` and pass it a GraphQL query document.
	 *
	 * When your component renders, `useQuery` returns an object from Apollo Client that contains `loading`, `error`, `dataState`, and `data` properties you can use to render your UI.
	 *
	 * > Refer to the [Queries](https://www.apollographql.com/docs/react/data/queries) section for a more in-depth overview of `useQuery`.
	 *
	 * @example
	 *
	 * ```jsx
	 * import { gql } from "@apollo/client";
	 * import { useQuery } from "@octanejs/apollo-client/react";
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
	 *   const { loading, error, data } = useQuery(GET_GREETING, {
	 *     variables: { language: "english" },
	 *   });
	 *   if (loading) return <p>Loading ...</p>;
	 *   return <h1>Hello {data.greeting.message}!</h1>;
	 * }
	 * ```
	 *
	 * @param query - A GraphQL query document parsed into an AST by `gql`.
	 * @param options - Options to control how the query is executed.
	 * @returns Query result object
	 */
	interface Signature extends Signatures.Evaluated {}
}
export declare const useQuery: useQuery.Signature;
