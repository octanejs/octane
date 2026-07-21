import type {
	ApolloClient,
	DataState,
	DefaultContext,
	DocumentNode,
	ErrorLike,
	ErrorPolicy,
	GetDataState,
	MaybeMasked,
	OperationVariables,
	RefetchOn,
	RefetchWritePolicy,
	TypedDocumentNode,
	WatchQueryFetchPolicy,
} from '@apollo/client';
import type { SubscribeToMoreFunction } from '@apollo/client';
import { NetworkStatus } from '@apollo/client';
import type { FetchMoreFunction, RefetchFunction } from '@octanejs/apollo-client/react/internal';
import type {
	DocumentationTypes as UtilityDocumentationTypes,
	NoInfer,
	OptionWithFallback,
	SignatureStyle,
	VariablesOption,
} from '@apollo/client/utilities/internal';
import type { SkipToken } from './constants.js';
export declare namespace useSuspenseQuery {
	type FetchPolicy = Extract<
		WatchQueryFetchPolicy,
		'cache-first' | 'network-only' | 'no-cache' | 'cache-and-network'
	>;
	namespace Base {
		interface Options<TVariables extends OperationVariables = OperationVariables> {
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
			 * If `true`, the query can return partial results from the cache if the cache doesn't contain results for all queried fields.
			 *
			 * The default value is `false`.
			 *
			 * @docGroup 3. Caching options
			 */
			returnPartialData?: boolean;
			/**
			 * Watched queries must opt into overwriting existing data on refetch, by passing refetchWritePolicy: "overwrite" in their WatchQueryOptions.
			 *
			 * The default value is "overwrite".
			 *
			 * @docGroup 3. Caching options
			 */
			refetchWritePolicy?: RefetchWritePolicy;
			/**
			 * Specifies how the query interacts with the Apollo Client cache during execution (for example, whether it checks the cache for results before sending a request to the server).
			 *
			 * For details, see [Setting a fetch policy](https://www.apollographql.com/docs/react/data/queries/#setting-a-fetch-policy).
			 *
			 * The default value is `cache-first`.
			 *
			 * @docGroup 3. Caching options
			 */
			fetchPolicy?: FetchPolicy;
			/**
			 * A unique identifier for the query. Each item in the array must be a stable
			 * identifier to prevent infinite fetches.
			 *
			 * This is useful when using the same query and variables combination in more
			 * than one component, otherwise the components may clobber each other. This
			 * can also be used to force the query to re-evaluate fresh.
			 *
			 * @docGroup 1. Operation options
			 */
			queryKey?: string | number | any[];
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
			/**
			 * If `true`, the query is not executed. The default value is `false`.
			 *
			 * @deprecated We recommend using `skipToken` in place of the `skip` option as
			 * it is more type-safe.
			 *
			 * This option is deprecated and only supported to ease the migration from `useQuery`. It will be removed in a future release.
			 * Please use [`skipToken`](https://www.apollographql.com/docs/react/api/react/hooks#skiptoken) instead of the `skip` option as it is more type-safe.
			 *
			 * @docGroup 1. Operation options
			 *
			 *
			 * @example Recommended usage of `skipToken`:
			 *
			 * ```ts
			 * import { skipToken, useSuspenseQuery } from "@apollo/client";
			 *
			 * const { data } = useSuspenseQuery(
			 *   query,
			 *   id ? { variables: { id } } : skipToken
			 * );
			 * ```
			 */
			skip?: boolean;
		}
	}
	type Options<TVariables extends OperationVariables = OperationVariables> =
		Base.Options<TVariables> & VariablesOption<TVariables>;
	namespace DocumentationTypes {
		namespace useSuspenseQuery {
			interface Options<TVariables extends OperationVariables = OperationVariables>
				extends Base.Options<TVariables>, UtilityDocumentationTypes.VariableOptions<TVariables> {}
		}
	}
	namespace Base {
		interface Result<TData = unknown, TVariables extends OperationVariables = OperationVariables> {
			/**
			 * The instance of `ApolloClient` to use to execute the query.
			 *
			 * By default, the instance that's passed down via context is used, but you
			 * can provide a different instance here.
			 *
			 * @docGroup 1. Operation options
			 */
			client: ApolloClient;
			/**
			 * A single ErrorLike object describing the error that occurred during the latest
			 * query execution.
			 *
			 * For more information, see [Handling operation errors](https://www.apollographql.com/docs/react/data/error-handling/).
			 *
			 * @docGroup 1. Operation data
			 */
			error: ErrorLike | undefined;
			/**
			 * A function that helps you fetch the next set of results for a [paginated list field](https://www.apollographql.com/docs/react/pagination/core-api/).
			 *
			 *
			 * @docGroup 3. Helper functions
			 *
			 *
			 * @remarks
			 * Calling this function will cause the component to re-suspend, unless the call site is wrapped in [`startTransition`](https://react.dev/reference/react/startTransition).
			 */
			fetchMore: FetchMoreFunction<TData, TVariables>;
			/**
			 * A number indicating the current network state of the query's associated request. [See possible values.](https://github.com/apollographql/apollo-client/blob/d96f4578f89b933c281bb775a39503f6cdb59ee8/src/core/networkStatus.ts#L4)
			 *
			 * Used in conjunction with the [`notifyOnNetworkStatusChange`](#notifyonnetworkstatuschange) option.
			 *
			 * @docGroup 2. Network info
			 */
			networkStatus: NetworkStatus;
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
			 *
			 *
			 * @remarks
			 * Calling this function will cause the component to re-suspend, unless the call site is wrapped in [`startTransition`](https://react.dev/reference/react/startTransition).
			 */
			refetch: RefetchFunction<TData, TVariables>;
			/**
			 * A function that enables you to execute a [subscription](https://www.apollographql.com/docs/react/data/subscriptions/), usually to subscribe to specific fields that were included in the query.
			 *
			 * This function returns _another_ function that you can call to terminate the subscription.
			 *
			 *
			 * @docGroup 3. Helper functions
			 */
			subscribeToMore: SubscribeToMoreFunction<TData, TVariables>;
		}
	}
	type Result<
		TData = unknown,
		TVariables extends OperationVariables = OperationVariables,
		TStates extends DataState<TData>['dataState'] = DataState<TData>['dataState'],
	> = Base.Result<TData, TVariables> & GetDataState<MaybeMasked<TData>, TStates>;
	interface DefaultOptions extends ApolloClient.DefaultOptions.WatchQuery.Calculated {
		skip: false;
	}
	type ResultForOptions<
		TData,
		TVariables extends OperationVariables,
		TOptions extends Record<string, never> | Options<TVariables> | SkipToken,
	> = Result<
		TData,
		TVariables,
		| 'complete'
		| 'streaming'
		| (TOptions extends any
				? TOptions extends SkipToken
					? 'empty'
					: | (OptionWithFallback<TOptions, DefaultOptions, 'errorPolicy'> extends 'none'
								? never
								: 'empty')
						| (OptionWithFallback<TOptions, DefaultOptions, 'skip'> extends false ? never : 'empty')
						| (OptionWithFallback<TOptions, DefaultOptions, 'returnPartialData'> extends false
								? never
								: 'partial')
				: never)
		| ([TOptions] extends [SkipToken]
				? DefaultOptions extends {
						returnPartialData: false;
					}
					? never
					: 'partial'
				: never)
	>;
	namespace DocumentationTypes {
		namespace useSuspenseQuery {
			interface Result<TData = unknown, TVariables extends OperationVariables = OperationVariables>
				extends Base.Result<TData, TVariables>, UtilityDocumentationTypes.DataState<TData> {}
		}
	}
	namespace DocumentationTypes {
		interface useSuspenseQuery {
			/**
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<TData = unknown, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options?: useSuspenseQuery.Options<TVariables>,
			): useSuspenseQuery.Result<TData, TVariables>;
		}
		interface useSuspenseQuery_Deprecated {
			/**
			 * @deprecated Avoid manually specifying generic arguments on `useSuspenseQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<TData = unknown, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options?: useSuspenseQuery.Options<TVariables>,
			): useSuspenseQuery.Result<TData, TVariables>;
		}
	}
	namespace Signatures {
		/**
		 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
		 *
		 * @example
		 *
		 * ```jsx
		 * import { Suspense } from "octane";
		 * import { useSuspenseQuery } from "@apollo/client";
		 *
		 * const listQuery = gql`
		 *   query {
		 *     list {
		 *       id
		 *     }
		 *   }
		 * `;
		 *
		 * function App() {
		 *   return (
		 *     <Suspense fallback={<Spinner />}>
		 *       <List />
		 *     </Suspense>
		 *   );
		 * }
		 *
		 * function List() {
		 *   const { data } = useSuspenseQuery(listQuery);
		 *
		 *   return (
		 *     <ol>
		 *       {data.list.map((item) => (
		 *         <Item key={item.id} id={item.id} />
		 *       ))}
		 *     </ol>
		 *   );
		 * }
		 * ```
		 *
		 * @param query - A GraphQL query document parsed into an AST by `gql`.
		 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
		 */
		interface Classic {
			/**
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useSuspenseQuery.Options<NoInfer<TVariables>> & {
					returnPartialData: true;
					errorPolicy: 'ignore' | 'all';
				},
			): useSuspenseQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'partial' | 'empty'>;
			/**
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useSuspenseQuery.Options<NoInfer<TVariables>> & {
					errorPolicy: 'ignore' | 'all';
				},
			): useSuspenseQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'empty'>;
			/**
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useSuspenseQuery.Options<NoInfer<TVariables>> & {
					skip: boolean;
					returnPartialData: true;
				},
			): useSuspenseQuery.Result<TData, TVariables, 'complete' | 'empty' | 'streaming' | 'partial'>;
			/**
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useSuspenseQuery.Options<NoInfer<TVariables>> & {
					returnPartialData: true;
				},
			): useSuspenseQuery.Result<TData, TVariables, 'partial' | 'streaming' | 'complete'>;
			/**
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useSuspenseQuery.Options<NoInfer<TVariables>> & {
					skip: boolean;
				},
			): useSuspenseQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'empty'>;
			/**
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options:
					| SkipToken
					| (useSuspenseQuery.Options<NoInfer<TVariables>> & {
							returnPartialData: true;
					  }),
			): useSuspenseQuery.Result<TData, TVariables, 'empty' | 'streaming' | 'complete' | 'partial'>;
			/**
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: useSuspenseQuery.Options<NoInfer<TVariables>>]
					: [options: useSuspenseQuery.Options<NoInfer<TVariables>>]
			): useSuspenseQuery.Result<TData, TVariables, 'complete' | 'streaming'>;
			/**
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: SkipToken | useSuspenseQuery.Options<NoInfer<TVariables>>]
					: [options: SkipToken | useSuspenseQuery.Options<NoInfer<TVariables>>]
			): useSuspenseQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'empty'>;
			/**
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: SkipToken | useSuspenseQuery.Options<NoInfer<TVariables>>,
			): useSuspenseQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'empty'>;
			/**
			 * @deprecated Avoid manually specifying generic arguments on `useSuspenseQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useSuspenseQuery.Options<NoInfer<TVariables>> & {
					returnPartialData: true;
					errorPolicy: 'ignore' | 'all';
				},
			): useSuspenseQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'partial' | 'empty'>;
			/**
			 * @deprecated Avoid manually specifying generic arguments on `useSuspenseQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useSuspenseQuery.Options<NoInfer<TVariables>> & {
					errorPolicy: 'ignore' | 'all';
				},
			): useSuspenseQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'empty'>;
			/**
			 * @deprecated Avoid manually specifying generic arguments on `useSuspenseQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useSuspenseQuery.Options<NoInfer<TVariables>> & {
					skip: boolean;
					returnPartialData: true;
				},
			): useSuspenseQuery.Result<TData, TVariables, 'complete' | 'empty' | 'streaming' | 'partial'>;
			/**
			 * @deprecated Avoid manually specifying generic arguments on `useSuspenseQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useSuspenseQuery.Options<NoInfer<TVariables>> & {
					returnPartialData: true;
				},
			): useSuspenseQuery.Result<TData, TVariables, 'partial' | 'streaming' | 'complete'>;
			/**
			 * @deprecated Avoid manually specifying generic arguments on `useSuspenseQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useSuspenseQuery.Options<NoInfer<TVariables>> & {
					skip: boolean;
				},
			): useSuspenseQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'empty'>;
			/**
			 * @deprecated Avoid manually specifying generic arguments on `useSuspenseQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options:
					| SkipToken
					| (useSuspenseQuery.Options<NoInfer<TVariables>> & {
							returnPartialData: true;
					  }),
			): useSuspenseQuery.Result<TData, TVariables, 'empty' | 'streaming' | 'complete' | 'partial'>;
			/**
			 * @deprecated Avoid manually specifying generic arguments on `useSuspenseQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: useSuspenseQuery.Options<NoInfer<TVariables>>]
					: [options: useSuspenseQuery.Options<NoInfer<TVariables>>]
			): useSuspenseQuery.Result<TData, TVariables, 'complete' | 'streaming'>;
			/**
			 * @deprecated Avoid manually specifying generic arguments on `useSuspenseQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: SkipToken | useSuspenseQuery.Options<NoInfer<TVariables>>]
					: [options: SkipToken | useSuspenseQuery.Options<NoInfer<TVariables>>]
			): useSuspenseQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'empty'>;
			/**
			 * @deprecated Avoid manually specifying generic arguments on `useSuspenseQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: SkipToken | useSuspenseQuery.Options<NoInfer<TVariables>>,
			): useSuspenseQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'empty'>;
		}
		/**
		 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
		 *
		 * @example
		 *
		 * ```jsx
		 * import { Suspense } from "octane";
		 * import { useSuspenseQuery } from "@apollo/client";
		 *
		 * const listQuery = gql`
		 *   query {
		 *     list {
		 *       id
		 *     }
		 *   }
		 * `;
		 *
		 * function App() {
		 *   return (
		 *     <Suspense fallback={<Spinner />}>
		 *       <List />
		 *     </Suspense>
		 *   );
		 * }
		 *
		 * function List() {
		 *   const { data } = useSuspenseQuery(listQuery);
		 *
		 *   return (
		 *     <ol>
		 *       {data.list.map((item) => (
		 *         <Item key={item.id} id={item.id} />
		 *       ))}
		 *     </ol>
		 *   );
		 * }
		 * ```
		 *
		 * @param query - A GraphQL query document parsed into an AST by `gql`.
		 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
		 */
		interface Modern {
			/**
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables, Options extends never>(
				query: {} extends TVariables ? DocumentNode | TypedDocumentNode<TData, TVariables> : never,
			): useSuspenseQuery.ResultForOptions<TData, TVariables, Record<string, never>>;
			/**
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				TOptions extends useSuspenseQuery.Options<NoInfer<TVariables>> &
					VariablesOption<
						TVariables & {
							[K in Exclude<keyof TOptions['variables'], keyof TVariables>]?: never;
						}
					>,
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables ? [options?: TOptions] : [options: TOptions]
			): useSuspenseQuery.ResultForOptions<TData, TVariables, TOptions>;
			/**
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables, TOptions extends never>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				skipToken: SkipToken,
			): useSuspenseQuery.ResultForOptions<TData, TVariables, SkipToken>;
			/**
			 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { useSuspenseQuery } from "@apollo/client";
			 *
			 * const listQuery = gql`
			 *   query {
			 *     list {
			 *       id
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<Spinner />}>
			 *       <List />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function List() {
			 *   const { data } = useSuspenseQuery(listQuery);
			 *
			 *   return (
			 *     <ol>
			 *       {data.list.map((item) => (
			 *         <Item key={item.id} id={item.id} />
			 *       ))}
			 *     </ol>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				TOptions extends useSuspenseQuery.Options<NoInfer<TVariables>> &
					VariablesOption<
						TVariables & {
							[K in Exclude<keyof TOptions['variables'], keyof TVariables>]?: never;
						}
					>,
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: TOptions | SkipToken]
					: [options: TOptions | SkipToken]
			): useSuspenseQuery.ResultForOptions<TData, TVariables, TOptions | SkipToken>;
		}
		type Evaluated = SignatureStyle extends 'classic' ? Classic : Modern;
	}
	/**
	 * For a detailed explanation of `useSuspenseQuery`, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
	 *
	 * @example
	 *
	 * ```jsx
	 * import { Suspense } from "octane";
	 * import { useSuspenseQuery } from "@apollo/client";
	 *
	 * const listQuery = gql`
	 *   query {
	 *     list {
	 *       id
	 *     }
	 *   }
	 * `;
	 *
	 * function App() {
	 *   return (
	 *     <Suspense fallback={<Spinner />}>
	 *       <List />
	 *     </Suspense>
	 *   );
	 * }
	 *
	 * function List() {
	 *   const { data } = useSuspenseQuery(listQuery);
	 *
	 *   return (
	 *     <ol>
	 *       {data.list.map((item) => (
	 *         <Item key={item.id} id={item.id} />
	 *       ))}
	 *     </ol>
	 *   );
	 * }
	 * ```
	 *
	 * @param query - A GraphQL query document parsed into an AST by `gql`.
	 * @param options - An optional object containing options for the query. Instead of passing a `useSuspenseQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useSuspenseQuery` hook from executing the query or suspending.
	 */
	interface Signature extends Signatures.Evaluated {}
}
export declare const useSuspenseQuery: useSuspenseQuery.Signature;
interface UseWatchQueryOptionsHookOptions<TData, TVariables extends OperationVariables> {
	client: ApolloClient;
	query: DocumentNode | TypedDocumentNode<TData, TVariables>;
	options: SkipToken | useSuspenseQuery.Options<TVariables>;
}
export declare function useWatchQueryOptions<TData, TVariables extends OperationVariables>({
	client,
	query,
	options,
}: UseWatchQueryOptionsHookOptions<TData, TVariables>): ApolloClient.WatchQueryOptions<
	TData,
	TVariables
>;
export {};
