import type {
	ApolloClient,
	DataState,
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
import type { OptionWithFallback, SignatureStyle } from '@apollo/client/utilities/internal';
type ResetFunction = () => void;
export declare namespace useLoadableQuery {
	type LoadQueryFunction<TVariables extends OperationVariables> = (
		...args: {} extends TVariables ? [variables?: TVariables] : [variables: TVariables]
	) => void;
	type Result<
		TData = unknown,
		TVariables extends OperationVariables = OperationVariables,
		TStates extends DataState<TData>['dataState'] = DataState<TData>['dataState'],
	> = [
		loadQuery: LoadQueryFunction<TVariables>,
		queryRef: QueryRef<TData, TVariables, TStates> | null,
		handlers: Handlers<TData, TVariables>,
	];
	interface Handlers<TData = unknown, TVariables extends OperationVariables = OperationVariables> {
		/**
		 * A function that helps you fetch the next set of results for a [paginated list field](https://www.apollographql.com/docs/react/pagination/core-api/).
		 *
		 *
		 * @docGroup 3. Helper functions
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
		 */
		refetch: RefetchFunction<TData, TVariables>;
		/**
		 * A function that enables you to execute a [subscription](https://www.apollographql.com/docs/react/data/subscriptions/), usually to subscribe to specific fields that were included in the query.
		 *
		 * This function returns _another_ function that you can call to terminate the subscription.
		 */
		subscribeToMore: SubscribeToMoreFunction<TData, TVariables>;
		/**
		 * A function that resets the `queryRef` back to `null`.
		 */
		reset: ResetFunction;
	}
	type FetchPolicy = Extract<
		WatchQueryFetchPolicy,
		'cache-first' | 'network-only' | 'no-cache' | 'cache-and-network'
	>;
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
		 * Specifies whether a `NetworkStatus.refetch` operation should merge
		 * incoming field data with existing data, or overwrite the existing data.
		 * Overwriting is probably preferable, but merging is currently the default
		 * behavior, for backwards compatibility with Apollo Client 3.x.
		 *
		 * @docGroup 3. Caching options
		 */
		refetchWritePolicy?: RefetchWritePolicy;
		/**
		 * If `true`, the query can return partial results from the cache if the cache doesn't contain results for all queried fields.
		 *
		 * The default value is `false`.
		 *
		 * @docGroup 3. Caching options
		 */
		returnPartialData?: boolean;
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
	interface DefaultOptions extends ApolloClient.DefaultOptions.WatchQuery.Calculated {}
	type ResultForOptions<
		TData,
		TVariables extends OperationVariables,
		TOptions extends Record<string, never> | Options,
	> = Result<
		TData,
		TVariables,
		| 'complete'
		| 'streaming'
		| (OptionWithFallback<TOptions, DefaultOptions, 'errorPolicy'> extends 'none' ? never : 'empty')
		| (OptionWithFallback<TOptions, DefaultOptions, 'returnPartialData'> extends false
				? never
				: 'partial')
	>;
	namespace DocumentationTypes {
		interface useLoadableQuery {
			/**
			 * A hook for imperatively loading a query, such as responding to a user
			 * interaction.
			 *
			 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql, useLoadableQuery } from "@apollo/client";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
			 *
			 *   return (
			 *     <>
			 *       <button onClick={() => loadGreeting({ language: "english" })}>
			 *         Load greeting
			 *       </button>
			 *       <Suspense fallback={<div>Loading...</div>}>
			 *         {queryRef && <Hello queryRef={queryRef} />}
			 *       </Suspense>
			 *     </>
			 *   );
			 * }
			 *
			 * function Hello({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.greeting.message}</div>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
			 */
			<TData = unknown, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useLoadableQuery.Options,
			): useLoadableQuery.Result<TData, TVariables>;
		}
		interface useLoadableQuery_Deprecated {
			/**
			 * @deprecated Avoid manually specifying generics on `useLoadableQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for imperatively loading a query, such as responding to a user
			 * interaction.
			 *
			 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql, useLoadableQuery } from "@apollo/client";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
			 *
			 *   return (
			 *     <>
			 *       <button onClick={() => loadGreeting({ language: "english" })}>
			 *         Load greeting
			 *       </button>
			 *       <Suspense fallback={<div>Loading...</div>}>
			 *         {queryRef && <Hello queryRef={queryRef} />}
			 *       </Suspense>
			 *     </>
			 *   );
			 * }
			 *
			 * function Hello({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.greeting.message}</div>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
			 */
			<TData = unknown, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useLoadableQuery.Options,
			): useLoadableQuery.Result<TData, TVariables>;
		}
	}
	namespace Signatures {
		/**
		 * A hook for imperatively loading a query, such as responding to a user
		 * interaction.
		 *
		 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
		 *
		 * @example
		 *
		 * ```jsx
		 * import { gql, useLoadableQuery } from "@apollo/client";
		 *
		 * const GET_GREETING = gql`
		 *   query GetGreeting($language: String!) {
		 *     greeting(language: $language) {
		 *       message
		 *     }
		 *   }
		 * `;
		 *
		 * function App() {
		 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
		 *
		 *   return (
		 *     <>
		 *       <button onClick={() => loadGreeting({ language: "english" })}>
		 *         Load greeting
		 *       </button>
		 *       <Suspense fallback={<div>Loading...</div>}>
		 *         {queryRef && <Hello queryRef={queryRef} />}
		 *       </Suspense>
		 *     </>
		 *   );
		 * }
		 *
		 * function Hello({ queryRef }) {
		 *   const { data } = useReadQuery(queryRef);
		 *
		 *   return <div>{data.greeting.message}</div>;
		 * }
		 * ```
		 *
		 * @param query - A GraphQL query document parsed into an AST by `gql`.
		 * @param options - Options to control how the query is executed.
		 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
		 */
		interface Classic {
			/**
			 * A hook for imperatively loading a query, such as responding to a user
			 * interaction.
			 *
			 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql, useLoadableQuery } from "@apollo/client";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
			 *
			 *   return (
			 *     <>
			 *       <button onClick={() => loadGreeting({ language: "english" })}>
			 *         Load greeting
			 *       </button>
			 *       <Suspense fallback={<div>Loading...</div>}>
			 *         {queryRef && <Hello queryRef={queryRef} />}
			 *       </Suspense>
			 *     </>
			 *   );
			 * }
			 *
			 * function Hello({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.greeting.message}</div>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useLoadableQuery.Options & {
					returnPartialData: true;
					errorPolicy: 'ignore' | 'all';
				},
			): useLoadableQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'partial' | 'empty'>;
			/**
			 * A hook for imperatively loading a query, such as responding to a user
			 * interaction.
			 *
			 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql, useLoadableQuery } from "@apollo/client";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
			 *
			 *   return (
			 *     <>
			 *       <button onClick={() => loadGreeting({ language: "english" })}>
			 *         Load greeting
			 *       </button>
			 *       <Suspense fallback={<div>Loading...</div>}>
			 *         {queryRef && <Hello queryRef={queryRef} />}
			 *       </Suspense>
			 *     </>
			 *   );
			 * }
			 *
			 * function Hello({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.greeting.message}</div>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useLoadableQuery.Options & {
					errorPolicy: 'ignore' | 'all';
				},
			): useLoadableQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'empty'>;
			/**
			 * A hook for imperatively loading a query, such as responding to a user
			 * interaction.
			 *
			 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql, useLoadableQuery } from "@apollo/client";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
			 *
			 *   return (
			 *     <>
			 *       <button onClick={() => loadGreeting({ language: "english" })}>
			 *         Load greeting
			 *       </button>
			 *       <Suspense fallback={<div>Loading...</div>}>
			 *         {queryRef && <Hello queryRef={queryRef} />}
			 *       </Suspense>
			 *     </>
			 *   );
			 * }
			 *
			 * function Hello({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.greeting.message}</div>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useLoadableQuery.Options & {
					returnPartialData: true;
				},
			): useLoadableQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'partial'>;
			/**
			 * A hook for imperatively loading a query, such as responding to a user
			 * interaction.
			 *
			 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql, useLoadableQuery } from "@apollo/client";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
			 *
			 *   return (
			 *     <>
			 *       <button onClick={() => loadGreeting({ language: "english" })}>
			 *         Load greeting
			 *       </button>
			 *       <Suspense fallback={<div>Loading...</div>}>
			 *         {queryRef && <Hello queryRef={queryRef} />}
			 *       </Suspense>
			 *     </>
			 *   );
			 * }
			 *
			 * function Hello({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.greeting.message}</div>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options?: useLoadableQuery.Options,
			): useLoadableQuery.Result<TData, TVariables, 'complete' | 'streaming'>;
			/**
			 * @deprecated Avoid manually specifying generics on `useLoadableQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for imperatively loading a query, such as responding to a user
			 * interaction.
			 *
			 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql, useLoadableQuery } from "@apollo/client";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
			 *
			 *   return (
			 *     <>
			 *       <button onClick={() => loadGreeting({ language: "english" })}>
			 *         Load greeting
			 *       </button>
			 *       <Suspense fallback={<div>Loading...</div>}>
			 *         {queryRef && <Hello queryRef={queryRef} />}
			 *       </Suspense>
			 *     </>
			 *   );
			 * }
			 *
			 * function Hello({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.greeting.message}</div>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useLoadableQuery.Options & {
					returnPartialData: true;
					errorPolicy: 'ignore' | 'all';
				},
			): useLoadableQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'partial' | 'empty'>;
			/**
			 * @deprecated Avoid manually specifying generics on `useLoadableQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for imperatively loading a query, such as responding to a user
			 * interaction.
			 *
			 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql, useLoadableQuery } from "@apollo/client";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
			 *
			 *   return (
			 *     <>
			 *       <button onClick={() => loadGreeting({ language: "english" })}>
			 *         Load greeting
			 *       </button>
			 *       <Suspense fallback={<div>Loading...</div>}>
			 *         {queryRef && <Hello queryRef={queryRef} />}
			 *       </Suspense>
			 *     </>
			 *   );
			 * }
			 *
			 * function Hello({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.greeting.message}</div>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useLoadableQuery.Options & {
					errorPolicy: 'ignore' | 'all';
				},
			): useLoadableQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'empty'>;
			/**
			 * @deprecated Avoid manually specifying generics on `useLoadableQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for imperatively loading a query, such as responding to a user
			 * interaction.
			 *
			 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql, useLoadableQuery } from "@apollo/client";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
			 *
			 *   return (
			 *     <>
			 *       <button onClick={() => loadGreeting({ language: "english" })}>
			 *         Load greeting
			 *       </button>
			 *       <Suspense fallback={<div>Loading...</div>}>
			 *         {queryRef && <Hello queryRef={queryRef} />}
			 *       </Suspense>
			 *     </>
			 *   );
			 * }
			 *
			 * function Hello({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.greeting.message}</div>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: useLoadableQuery.Options & {
					returnPartialData: true;
				},
			): useLoadableQuery.Result<TData, TVariables, 'complete' | 'streaming' | 'partial'>;
			/**
			 * @deprecated Avoid manually specifying generics on `useLoadableQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A hook for imperatively loading a query, such as responding to a user
			 * interaction.
			 *
			 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql, useLoadableQuery } from "@apollo/client";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
			 *
			 *   return (
			 *     <>
			 *       <button onClick={() => loadGreeting({ language: "english" })}>
			 *         Load greeting
			 *       </button>
			 *       <Suspense fallback={<div>Loading...</div>}>
			 *         {queryRef && <Hello queryRef={queryRef} />}
			 *       </Suspense>
			 *     </>
			 *   );
			 * }
			 *
			 * function Hello({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.greeting.message}</div>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options?: useLoadableQuery.Options,
			): useLoadableQuery.Result<TData, TVariables, 'complete' | 'streaming'>;
		}
		/**
		 * A hook for imperatively loading a query, such as responding to a user
		 * interaction.
		 *
		 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
		 *
		 * @example
		 *
		 * ```jsx
		 * import { gql, useLoadableQuery } from "@apollo/client";
		 *
		 * const GET_GREETING = gql`
		 *   query GetGreeting($language: String!) {
		 *     greeting(language: $language) {
		 *       message
		 *     }
		 *   }
		 * `;
		 *
		 * function App() {
		 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
		 *
		 *   return (
		 *     <>
		 *       <button onClick={() => loadGreeting({ language: "english" })}>
		 *         Load greeting
		 *       </button>
		 *       <Suspense fallback={<div>Loading...</div>}>
		 *         {queryRef && <Hello queryRef={queryRef} />}
		 *       </Suspense>
		 *     </>
		 *   );
		 * }
		 *
		 * function Hello({ queryRef }) {
		 *   const { data } = useReadQuery(queryRef);
		 *
		 *   return <div>{data.greeting.message}</div>;
		 * }
		 * ```
		 *
		 * @param query - A GraphQL query document parsed into an AST by `gql`.
		 * @param options - Options to control how the query is executed.
		 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
		 */
		interface Modern {
			/**
			 * A hook for imperatively loading a query, such as responding to a user
			 * interaction.
			 *
			 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql, useLoadableQuery } from "@apollo/client";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
			 *
			 *   return (
			 *     <>
			 *       <button onClick={() => loadGreeting({ language: "english" })}>
			 *         Load greeting
			 *       </button>
			 *       <Suspense fallback={<div>Loading...</div>}>
			 *         {queryRef && <Hello queryRef={queryRef} />}
			 *       </Suspense>
			 *     </>
			 *   );
			 * }
			 *
			 * function Hello({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.greeting.message}</div>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
			 */
			<TData, TVariables extends OperationVariables, TOptions extends never>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
			): useLoadableQuery.ResultForOptions<TData, TVariables, Record<string, never>>;
			/**
			 * A hook for imperatively loading a query, such as responding to a user
			 * interaction.
			 *
			 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
			 *
			 * @example
			 *
			 * ```jsx
			 * import { gql, useLoadableQuery } from "@apollo/client";
			 *
			 * const GET_GREETING = gql`
			 *   query GetGreeting($language: String!) {
			 *     greeting(language: $language) {
			 *       message
			 *     }
			 *   }
			 * `;
			 *
			 * function App() {
			 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
			 *
			 *   return (
			 *     <>
			 *       <button onClick={() => loadGreeting({ language: "english" })}>
			 *         Load greeting
			 *       </button>
			 *       <Suspense fallback={<div>Loading...</div>}>
			 *         {queryRef && <Hello queryRef={queryRef} />}
			 *       </Suspense>
			 *     </>
			 *   );
			 * }
			 *
			 * function Hello({ queryRef }) {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   return <div>{data.greeting.message}</div>;
			 * }
			 * ```
			 *
			 * @param query - A GraphQL query document parsed into an AST by `gql`.
			 * @param options - Options to control how the query is executed.
			 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
			 */
			<TData, TVariables extends OperationVariables, TOptions extends useLoadableQuery.Options>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: TOptions,
			): useLoadableQuery.ResultForOptions<TData, TVariables, TOptions>;
		}
		type Evaluated = SignatureStyle extends 'classic' ? Classic : Modern;
	}
	/**
	 * A hook for imperatively loading a query, such as responding to a user
	 * interaction.
	 *
	 * > Refer to the [Suspense - Fetching in response to user interaction](https://www.apollographql.com/docs/react/data/suspense#fetching-in-response-to-user-interaction) section for a more in-depth overview of `useLoadableQuery`.
	 *
	 * @example
	 *
	 * ```jsx
	 * import { gql, useLoadableQuery } from "@apollo/client";
	 *
	 * const GET_GREETING = gql`
	 *   query GetGreeting($language: String!) {
	 *     greeting(language: $language) {
	 *       message
	 *     }
	 *   }
	 * `;
	 *
	 * function App() {
	 *   const [loadGreeting, queryRef] = useLoadableQuery(GET_GREETING);
	 *
	 *   return (
	 *     <>
	 *       <button onClick={() => loadGreeting({ language: "english" })}>
	 *         Load greeting
	 *       </button>
	 *       <Suspense fallback={<div>Loading...</div>}>
	 *         {queryRef && <Hello queryRef={queryRef} />}
	 *       </Suspense>
	 *     </>
	 *   );
	 * }
	 *
	 * function Hello({ queryRef }) {
	 *   const { data } = useReadQuery(queryRef);
	 *
	 *   return <div>{data.greeting.message}</div>;
	 * }
	 * ```
	 *
	 * @param query - A GraphQL query document parsed into an AST by `gql`.
	 * @param options - Options to control how the query is executed.
	 * @returns A tuple in the form of `[loadQuery, queryRef, handlers]`
	 */
	interface Signature extends Signatures.Evaluated {}
}
export declare const useLoadableQuery: useLoadableQuery.Signature;
export {};
