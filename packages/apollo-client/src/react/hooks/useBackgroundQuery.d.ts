import type {
	ApolloClient,
	DefaultContext,
	DocumentNode,
	ErrorPolicy,
	OperationVariables,
	RefetchOn,
	RefetchWritePolicy,
	TypedDocumentNode,
	WatchQueryFetchPolicy,
} from '@apollo/client';
import type { SubscribeToMoreFunction } from '@apollo/client';
import type { QueryRef } from '@octanejs/apollo-client/react';
import type { FetchMoreFunction, RefetchFunction } from '@octanejs/apollo-client/react/internal';
import type {
	DocumentationTypes as UtilityDocumentationTypes,
	NoInfer,
	OptionWithFallback,
	SignatureStyle,
	VariablesOption,
} from '@apollo/client/utilities/internal';
import type { SkipToken } from './constants.js';
export declare namespace useBackgroundQuery {
	import _self = useBackgroundQuery;
	type FetchPolicy = Extract<
		WatchQueryFetchPolicy,
		'cache-first' | 'network-only' | 'no-cache' | 'cache-and-network'
	>;
	namespace Base {
		interface Options {
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
			 * Watched queries must opt into overwriting existing data on refetch, by passing refetchWritePolicy: "overwrite" in their WatchQueryOptions.
			 *
			 * The default value is "overwrite".
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
			 * If you're using [Apollo Link](https://www.apollographql.com/docs/react/api/link/introduction/), this object is the initial value of the `context` object that's passed along your link chain.
			 *
			 * @docGroup 2. Networking options
			 */
			context?: DefaultContext;
			/**
			 * If `true`, the query can return partial results from the cache if the cache doesn't contain results for all queried fields.
			 *
			 * The default value is `false`.
			 *
			 * @docGroup 3. Caching options
			 */
			returnPartialData?: boolean;
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
			 * import { skipToken, useBackgroundQuery } from "@apollo/client";
			 *
			 * const [queryRef] = useBackgroundQuery(
			 *   query,
			 *   id ? { variables: { id } } : skipToken
			 * );
			 * ```
			 */
			skip?: boolean;
		}
	}
	type Options<TVariables extends OperationVariables = OperationVariables> = Base.Options &
		VariablesOption<TVariables>;
	namespace DocumentationTypes {
		namespace useBackgroundQuery {
			interface Options<TVariables extends OperationVariables = OperationVariables>
				extends Base.Options, UtilityDocumentationTypes.VariableOptions<TVariables> {}
		}
	}
	interface Result<TData = unknown, TVariables extends OperationVariables = OperationVariables> {
		/**
		 * A function that enables you to execute a [subscription](https://www.apollographql.com/docs/react/data/subscriptions/), usually to subscribe to specific fields that were included in the query.
		 *
		 * This function returns _another_ function that you can call to terminate the subscription.
		 */
		subscribeToMore: SubscribeToMoreFunction<TData, TVariables>;
		/**
		 * A function that helps you fetch the next set of results for a [paginated list field](https://www.apollographql.com/docs/react/pagination/core-api/).
		 *
		 *
		 * @remarks
		 * Calling this function will cause the component to re-suspend, unless the call site is wrapped in [`startTransition`](https://react.dev/reference/react/startTransition).
		 */
		fetchMore: FetchMoreFunction<TData, TVariables>;
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
	}
	namespace DocumentationTypes {
		namespace useBackgroundQuery {
			interface Result<
				TData = unknown,
				TVariables extends OperationVariables = OperationVariables,
			> extends _self.Result<TData, TVariables> {}
		}
	}
	interface DefaultOptions extends ApolloClient.DefaultOptions.WatchQuery.Calculated {
		skip: false;
	}
	type ResultForOptions<
		TData,
		TVariables extends OperationVariables,
		TOptions extends Record<string, never> | Options<TVariables> | SkipToken,
	> = [
		queryRef: TOptions extends any
			? TOptions extends SkipToken
				? undefined
				: | QueryRef<
							TData,
							TVariables,
							| 'complete'
							| 'streaming'
							| (
									| (OptionWithFallback<TOptions, DefaultOptions, 'errorPolicy'> extends 'none'
											? never
											: 'empty')
									| (OptionWithFallback<TOptions, DefaultOptions, 'returnPartialData'> extends false
											? never
											: 'partial')
							  )
					  >
					| (OptionWithFallback<TOptions, DefaultOptions, 'skip'> extends false ? never : undefined)
			: never,
		result: useBackgroundQuery.Result<TData, TVariables>,
	];
	namespace DocumentationTypes {
		interface useBackgroundQuery {
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData = unknown, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: SkipToken | useBackgroundQuery.Options<TVariables>,
			): [QueryRef<TData, TVariables> | undefined, useBackgroundQuery.Result<TData, TVariables>];
		}
		interface useBackgroundQuery_Deprecated {
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData = unknown, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: SkipToken | useBackgroundQuery.Options<TVariables>,
			): [QueryRef<TData, TVariables> | undefined, useBackgroundQuery.Result<TData, TVariables>];
		}
	}
	namespace Signatures {
		/**
		 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
		 *
		 * @returns A tuple containing:
		 *
		 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
		 * 2.  An object containing helper functions for the query:
		 *     - `refetch`: A function to re-execute the query
		 *     - `fetchMore`: A function to fetch more results for pagination
		 *     - `subscribeToMore`: A function to subscribe to updates
		 *
		 * @example
		 *
		 * ```jsx
		 * import { Suspense } from "octane";
		 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
		 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
		 *
		 * const query = gql`
		 *   foo {
		 *     bar
		 *   }
		 * `;
		 *
		 * const client = new ApolloClient({
		 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
		 *   cache: new InMemoryCache(),
		 * });
		 *
		 * function SuspenseFallback() {
		 *   return <div>Loading...</div>;
		 * }
		 *
		 * function Child({ queryRef }) {
		 *   const { data } = useReadQuery(queryRef);
		 *
		 *   return <div>{data.foo.bar}</div>;
		 * }
		 *
		 * function Parent() {
		 *   const [queryRef] = useBackgroundQuery(query);
		 *
		 *   return (
		 *     <Suspense fallback={<SuspenseFallback />}>
		 *       <Child queryRef={queryRef} />
		 *     </Suspense>
		 *   );
		 * }
		 *
		 * function App() {
		 *   return (
		 *     <ApolloProvider client={client}>
		 *       <Parent />
		 *     </ApolloProvider>
		 *   );
		 * }
		 * ```
		 *
		 * @param query - A GraphQL query document parsed into an AST by `gql`.
		 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
		 */
		interface Classic {
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					/** @deprecated `returnPartialData` has no effect on `no-cache` queries */
					returnPartialData: boolean;
					fetchPolicy: 'no-cache';
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'>,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					returnPartialData: false;
					errorPolicy: 'ignore' | 'all';
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming' | 'empty'>,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					returnPartialData: boolean;
					errorPolicy: 'ignore' | 'all';
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming' | 'partial' | 'empty'>,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					errorPolicy: 'ignore' | 'all';
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming' | 'empty'>,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					skip: boolean;
					returnPartialData: false;
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'> | undefined,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					skip: boolean;
					returnPartialData: boolean;
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming' | 'partial'> | undefined,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					returnPartialData: false;
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'>,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					returnPartialData: boolean;
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming' | 'partial'>,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					skip: boolean;
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'> | undefined,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: SkipToken,
			): [undefined, useBackgroundQuery.Result<TData, TVariables>];
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options:
					| SkipToken
					| (useBackgroundQuery.Options<NoInfer<TVariables>> & {
							returnPartialData: false;
					  }),
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'> | undefined,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options:
					| SkipToken
					| (useBackgroundQuery.Options<NoInfer<TVariables>> & {
							returnPartialData: boolean;
					  }),
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming' | 'partial'> | undefined,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: useBackgroundQuery.Options<NoInfer<TVariables>>]
					: [options: useBackgroundQuery.Options<NoInfer<TVariables>>]
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'>,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: SkipToken | useBackgroundQuery.Options<NoInfer<TVariables>>]
					: [options: SkipToken | useBackgroundQuery.Options<NoInfer<TVariables>>]
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'> | undefined,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: SkipToken | useBackgroundQuery.Options<NoInfer<TVariables>>,
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'> | undefined,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					/** @deprecated `returnPartialData` has no effect on `no-cache` queries */
					returnPartialData: boolean;
					fetchPolicy: 'no-cache';
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'>,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					returnPartialData: false;
					errorPolicy: 'ignore' | 'all';
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming' | 'empty'>,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					returnPartialData: boolean;
					errorPolicy: 'ignore' | 'all';
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming' | 'partial' | 'empty'>,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					errorPolicy: 'ignore' | 'all';
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming' | 'empty'>,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					skip: boolean;
					returnPartialData: false;
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'> | undefined,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					skip: boolean;
					returnPartialData: boolean;
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming' | 'partial'> | undefined,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					returnPartialData: false;
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'>,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					returnPartialData: boolean;
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming' | 'partial'>,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useBackgroundQuery.Options<NoInfer<TVariables>> & {
					skip: boolean;
				},
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'> | undefined,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: SkipToken,
			): [undefined, useBackgroundQuery.Result<TData, TVariables>];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options:
					| SkipToken
					| (useBackgroundQuery.Options<NoInfer<TVariables>> & {
							returnPartialData: false;
					  }),
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'> | undefined,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options:
					| SkipToken
					| (useBackgroundQuery.Options<NoInfer<TVariables>> & {
							returnPartialData: boolean;
					  }),
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming' | 'partial'> | undefined,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: useBackgroundQuery.Options<NoInfer<TVariables>>]
					: [options: useBackgroundQuery.Options<NoInfer<TVariables>>]
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'>,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: SkipToken | useBackgroundQuery.Options<NoInfer<TVariables>>]
					: [options: SkipToken | useBackgroundQuery.Options<NoInfer<TVariables>>]
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'> | undefined,
				useBackgroundQuery.Result<TData, TVariables>,
			];
			/**
			 * @deprecated Avoid manually specifying generics on `useBackgroundQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: SkipToken | useBackgroundQuery.Options<NoInfer<TVariables>>,
			): [
				QueryRef<TData, TVariables, 'complete' | 'streaming'> | undefined,
				useBackgroundQuery.Result<TData, TVariables>,
			];
		}
		/**
		 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
		 *
		 * @returns A tuple containing:
		 *
		 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
		 * 2.  An object containing helper functions for the query:
		 *     - `refetch`: A function to re-execute the query
		 *     - `fetchMore`: A function to fetch more results for pagination
		 *     - `subscribeToMore`: A function to subscribe to updates
		 *
		 * @example
		 *
		 * ```jsx
		 * import { Suspense } from "octane";
		 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
		 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
		 *
		 * const query = gql`
		 *   foo {
		 *     bar
		 *   }
		 * `;
		 *
		 * const client = new ApolloClient({
		 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
		 *   cache: new InMemoryCache(),
		 * });
		 *
		 * function SuspenseFallback() {
		 *   return <div>Loading...</div>;
		 * }
		 *
		 * function Child({ queryRef }) {
		 *   const { data } = useReadQuery(queryRef);
		 *
		 *   return <div>{data.foo.bar}</div>;
		 * }
		 *
		 * function Parent() {
		 *   const [queryRef] = useBackgroundQuery(query);
		 *
		 *   return (
		 *     <Suspense fallback={<SuspenseFallback />}>
		 *       <Child queryRef={queryRef} />
		 *     </Suspense>
		 *   );
		 * }
		 *
		 * function App() {
		 *   return (
		 *     <ApolloProvider client={client}>
		 *       <Parent />
		 *     </ApolloProvider>
		 *   );
		 * }
		 * ```
		 *
		 * @param query - A GraphQL query document parsed into an AST by `gql`.
		 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
		 */
		interface Modern {
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables, TOptions extends never>(
				query: {} extends TVariables ? DocumentNode | TypedDocumentNode<TData, TVariables> : never,
			): useBackgroundQuery.ResultForOptions<TData, TVariables, Record<string, never>>;
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				TOptions extends useBackgroundQuery.Options<NoInfer<TVariables>> &
					VariablesOption<
						TVariables & {
							[K in Exclude<keyof TOptions['variables'], keyof TVariables>]?: never;
						}
					>,
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables ? [options?: TOptions] : [options: TOptions]
			): useBackgroundQuery.ResultForOptions<TData, TVariables, TOptions>;
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<TData, TVariables extends OperationVariables, TOptions extends never>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				skipToken: SkipToken,
			): useBackgroundQuery.ResultForOptions<TData, TVariables, SkipToken>;
			/**
			 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
			 *
			 * @returns A tuple containing:
			 *
			 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
			 * 2.  An object containing helper functions for the query:
			 *     - `refetch`: A function to re-execute the query
			 *     - `fetchMore`: A function to fetch more results for pagination
			 *     - `subscribeToMore`: A function to subscribe to updates
			 *
			 * @example
			 *
			 * ```jsx
			 * import { Suspense } from "octane";
			 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
			 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
			 *
			 * const query = gql`
			 *   foo {
			 *     bar
			 *   }
			 * `;
			 *
			 * const client = new ApolloClient({
			 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
			 *   cache: new InMemoryCache(),
			 * });
			 *
			 * function SuspenseFallback() {
			 *   return <div>Loading...</div>;
			 * }
			 *
			 * function Child({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.foo.bar}</div>;
			 * }
			 *
			 * function Parent() {
			 *   const [queryRef] = useBackgroundQuery(query);
			 *
			 *   return (
			 *     <Suspense fallback={<SuspenseFallback />}>
			 *       <Child queryRef={queryRef} />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function App() {
			 *   return (
			 *     <ApolloProvider client={client}>
			 *       <Parent />
			 *     </ApolloProvider>
			 *   );
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
			 */
			<
				TData,
				TVariables extends OperationVariables,
				TOptions extends useBackgroundQuery.Options<NoInfer<TVariables>> &
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
			): useBackgroundQuery.ResultForOptions<TData, TVariables, TOptions | SkipToken>;
		}
		type Evaluated = SignatureStyle extends 'classic' ? Classic : Modern;
	}
	/**
	 * For a detailed explanation of useBackgroundQuery, see the [fetching with Suspense reference](https://www.apollographql.com/docs/react/data/suspense).
	 *
	 * @returns A tuple containing:
	 *
	 * 1.  A `QueryRef` that can be passed to `useReadQuery` to read the query result. The `queryRef` is `undefined` if the query is skipped.
	 * 2.  An object containing helper functions for the query:
	 *     - `refetch`: A function to re-execute the query
	 *     - `fetchMore`: A function to fetch more results for pagination
	 *     - `subscribeToMore`: A function to subscribe to updates
	 *
	 * @example
	 *
	 * ```jsx
	 * import { Suspense } from "octane";
	 * import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
	 * import { useBackgroundQuery, useReadQuery } from "@octanejs/apollo-client/react";
	 *
	 * const query = gql`
	 *   foo {
	 *     bar
	 *   }
	 * `;
	 *
	 * const client = new ApolloClient({
	 *   link: new HttpLink({ uri: "http://localhost:4000/graphql" }),
	 *   cache: new InMemoryCache(),
	 * });
	 *
	 * function SuspenseFallback() {
	 *   return <div>Loading...</div>;
	 * }
	 *
	 * function Child({ queryRef }) {
	 *   const { data } = useReadQuery(queryRef);
	 *
	 *   return <div>{data.foo.bar}</div>;
	 * }
	 *
	 * function Parent() {
	 *   const [queryRef] = useBackgroundQuery(query);
	 *
	 *   return (
	 *     <Suspense fallback={<SuspenseFallback />}>
	 *       <Child queryRef={queryRef} />
	 *     </Suspense>
	 *   );
	 * }
	 *
	 * function App() {
	 *   return (
	 *     <ApolloProvider client={client}>
	 *       <Parent />
	 *     </ApolloProvider>
	 *   );
	 * }
	 * ```
	 *
	 * @param query - A GraphQL query document parsed into an AST by `gql`.
	 * @param options - An optional object containing options for the query. Instead of passing a `useBackgroundQuery.Options` object into the hook, you can also pass a [`skipToken`](#skiptoken) to prevent the `useBackgroundQuery` hook from executing the query or suspending.
	 */
	interface Signature extends Signatures.Evaluated {}
}
export declare const useBackgroundQuery: useBackgroundQuery.Signature;
