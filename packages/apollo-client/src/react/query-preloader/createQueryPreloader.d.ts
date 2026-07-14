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
import type { PreloadedQueryRef } from '@octanejs/apollo-client/react';
import type {
	NoInfer,
	OptionWithFallback,
	SignatureStyle,
	VariablesOption,
} from '@apollo/client/utilities/internal';
export type PreloadQueryFetchPolicy = Extract<
	WatchQueryFetchPolicy,
	'cache-first' | 'network-only' | 'no-cache' | 'cache-and-network'
>;
export type PreloadQueryOptions<TVariables extends OperationVariables = OperationVariables> = {
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
	fetchPolicy?: PreloadQueryFetchPolicy;
	/**
	 * If `true`, the query can return partial results from the cache if the cache doesn't contain results for all queried fields.
	 *
	 * The default value is `false`.
	 *
	 * @docGroup 3. Caching options
	 */
	returnPartialData?: boolean;
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
} & VariablesOption<TVariables>;
/**
 * A function that will begin loading a query when called. It's result can be
 * read by `useReadQuery` which will suspend until the query is loaded.
 * This is useful when you want to start loading a query as early as possible
 * outside of a React component.
 *
 * @example
 *
 * ```js
 * const preloadQuery = createQueryPreloader(client);
 * const queryRef = preloadQuery(query, { variables, ...otherOptions });
 *
 * function App() {
 *   return (
 *     <Suspense fallback={<div>Loading</div>}>
 *       <MyQuery />
 *     </Suspense>
 *   );
 * }
 *
 * function MyQuery() {
 *   const { data } = useReadQuery(queryRef);
 *
 *   // do something with `data`
 * }
 * ```
 */
export interface PreloadQueryFunction extends PreloadQueryFunction.Signatures.Evaluated {
	/**
	 * A function that returns a promise that resolves when the query has finished
	 * loading. The promise resolves with the `QueryReference` itself.
	 *
	 * @remarks
	 * This method is useful for preloading queries in data loading routers, such
	 * as [React Router](https://reactrouter.com/en/main) or [TanStack Router](https://tanstack.com/router),
	 * to prevent routes from transitioning until the query has finished loading.
	 * `data` is not exposed on the promise to discourage using the data in
	 * `loader` functions and exposing it to your route components. Instead, we
	 * prefer you rely on `useReadQuery` to access the data to ensure your
	 * component can rerender with cache updates. If you need to access raw query
	 * data, use `client.query()` directly.
	 *
	 * @example
	 * Here's an example using React Router's `loader` function:
	 *
	 * ```ts
	 * import { createQueryPreloader } from "@apollo/client";
	 *
	 * const preloadQuery = createQueryPreloader(client);
	 *
	 * export async function loader() {
	 *   const queryRef = preloadQuery(GET_DOGS_QUERY);
	 *
	 *   return preloadQuery.toPromise(queryRef);
	 * }
	 *
	 * export function RouteComponent() {
	 *   const queryRef = useLoaderData();
	 *   const { data } = useReadQuery(queryRef);
	 *
	 *   // ...
	 * }
	 * ```
	 */
	toPromise<TQueryRef extends PreloadedQueryRef<any, any, any>>(
		queryRef: TQueryRef,
	): Promise<TQueryRef>;
}
export declare namespace PreloadQueryFunction {
	interface DefaultOptions extends ApolloClient.DefaultOptions.WatchQuery.Calculated {}
	namespace DocumentationTypes {
		/**
		 * @deprecated Avoid manually specifying generics on `preloadQuery`.
		 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
		 *
		 *
		 * A function that will begin loading a query when called. It's result can be
		 * read by `useReadQuery` which will suspend until the query is loaded.
		 * This is useful when you want to start loading a query as early as possible
		 * outside of a React component.
		 *
		 * @example
		 *
		 * ```js
		 * const preloadQuery = createQueryPreloader(client);
		 * const queryRef = preloadQuery(query, { variables, ...otherOptions });
		 *
		 * function App() {
		 *   return (
		 *     <Suspense fallback={<div>Loading</div>}>
		 *       <MyQuery />
		 *     </Suspense>
		 *   );
		 * }
		 *
		 * function MyQuery() {
		 *   const { data } = useReadQuery(queryRef);
		 *
		 *   // do something with `data`
		 * }
		 * ```
		 */
		interface PreloadQueryFunction_Deprecated extends PreloadQueryFunction {}
	}
	type ResultForOptions<
		TData,
		TVariables extends OperationVariables,
		TOptions extends Record<string, never> | PreloadQueryOptions<TVariables>,
	> = TOptions extends any
		? PreloadedQueryRef<TData, TVariables, ResultForOptions.States<TOptions, DefaultOptions>>
		: never;
	namespace ResultForOptions {
		type States<TOptions, TDefaultOptions extends DefaultOptions = DefaultOptions> =
			| 'complete'
			| 'streaming'
			| (OptionWithFallback<TOptions, TDefaultOptions, 'errorPolicy'> extends 'none'
					? never
					: 'empty')
			| (OptionWithFallback<TOptions, TDefaultOptions, 'returnPartialData'> extends false
					? never
					: 'partial');
	}
	namespace Signatures {
		interface Classic {
			/**
			 * A function that will begin loading a query when called. It's result can be
			 * read by `useReadQuery` which will suspend until the query is loaded.
			 * This is useful when you want to start loading a query as early as possible
			 * outside of a React component.
			 *
			 * @example
			 *
			 * ```js
			 * const preloadQuery = createQueryPreloader(client);
			 * const queryRef = preloadQuery(query, { variables, ...otherOptions });
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<div>Loading</div>}>
			 *       <MyQuery />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function MyQuery() {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   // do something with `data`
			 * }
			 * ```
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: PreloadQueryOptions<NoInfer<TVariables>> & {
					returnPartialData: true;
					errorPolicy: 'ignore' | 'all';
				},
			): PreloadedQueryRef<TData, TVariables, 'complete' | 'streaming' | 'partial' | 'empty'>;
			/**
			 * A function that will begin loading a query when called. It's result can be
			 * read by `useReadQuery` which will suspend until the query is loaded.
			 * This is useful when you want to start loading a query as early as possible
			 * outside of a React component.
			 *
			 * @example
			 *
			 * ```js
			 * const preloadQuery = createQueryPreloader(client);
			 * const queryRef = preloadQuery(query, { variables, ...otherOptions });
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<div>Loading</div>}>
			 *       <MyQuery />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function MyQuery() {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   // do something with `data`
			 * }
			 * ```
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: PreloadQueryOptions<NoInfer<TVariables>> & {
					errorPolicy: 'ignore' | 'all';
				},
			): PreloadedQueryRef<TData, TVariables, 'complete' | 'streaming' | 'empty'>;
			/**
			 * A function that will begin loading a query when called. It's result can be
			 * read by `useReadQuery` which will suspend until the query is loaded.
			 * This is useful when you want to start loading a query as early as possible
			 * outside of a React component.
			 *
			 * @example
			 *
			 * ```js
			 * const preloadQuery = createQueryPreloader(client);
			 * const queryRef = preloadQuery(query, { variables, ...otherOptions });
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<div>Loading</div>}>
			 *       <MyQuery />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function MyQuery() {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   // do something with `data`
			 * }
			 * ```
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: PreloadQueryOptions<NoInfer<TVariables>> & {
					returnPartialData: true;
				},
			): PreloadedQueryRef<TData, TVariables, 'complete' | 'streaming' | 'partial'>;
			/**
			 * A function that will begin loading a query when called. It's result can be
			 * read by `useReadQuery` which will suspend until the query is loaded.
			 * This is useful when you want to start loading a query as early as possible
			 * outside of a React component.
			 *
			 * @example
			 *
			 * ```js
			 * const preloadQuery = createQueryPreloader(client);
			 * const queryRef = preloadQuery(query, { variables, ...otherOptions });
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<div>Loading</div>}>
			 *       <MyQuery />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function MyQuery() {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   // do something with `data`
			 * }
			 * ```
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: PreloadQueryOptions<NoInfer<TVariables>>]
					: [options: PreloadQueryOptions<NoInfer<TVariables>>]
			): PreloadedQueryRef<TData, TVariables, 'complete' | 'streaming'>;
			/**
			 * @deprecated Avoid manually specifying generics on `preloadQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A function that will begin loading a query when called. It's result can be
			 * read by `useReadQuery` which will suspend until the query is loaded.
			 * This is useful when you want to start loading a query as early as possible
			 * outside of a React component.
			 *
			 * @example
			 *
			 * ```js
			 * const preloadQuery = createQueryPreloader(client);
			 * const queryRef = preloadQuery(query, { variables, ...otherOptions });
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<div>Loading</div>}>
			 *       <MyQuery />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function MyQuery() {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   // do something with `data`
			 * }
			 * ```
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: PreloadQueryOptions<NoInfer<TVariables>> & {
					returnPartialData: true;
					errorPolicy: 'ignore' | 'all';
				},
			): PreloadedQueryRef<TData, TVariables, 'complete' | 'streaming' | 'partial' | 'empty'>;
			/**
			 * @deprecated Avoid manually specifying generics on `preloadQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A function that will begin loading a query when called. It's result can be
			 * read by `useReadQuery` which will suspend until the query is loaded.
			 * This is useful when you want to start loading a query as early as possible
			 * outside of a React component.
			 *
			 * @example
			 *
			 * ```js
			 * const preloadQuery = createQueryPreloader(client);
			 * const queryRef = preloadQuery(query, { variables, ...otherOptions });
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<div>Loading</div>}>
			 *       <MyQuery />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function MyQuery() {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   // do something with `data`
			 * }
			 * ```
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: PreloadQueryOptions<NoInfer<TVariables>> & {
					errorPolicy: 'ignore' | 'all';
				},
			): PreloadedQueryRef<TData, TVariables, 'complete' | 'streaming' | 'empty'>;
			/**
			 * @deprecated Avoid manually specifying generics on `preloadQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A function that will begin loading a query when called. It's result can be
			 * read by `useReadQuery` which will suspend until the query is loaded.
			 * This is useful when you want to start loading a query as early as possible
			 * outside of a React component.
			 *
			 * @example
			 *
			 * ```js
			 * const preloadQuery = createQueryPreloader(client);
			 * const queryRef = preloadQuery(query, { variables, ...otherOptions });
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<div>Loading</div>}>
			 *       <MyQuery />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function MyQuery() {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   // do something with `data`
			 * }
			 * ```
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options: PreloadQueryOptions<NoInfer<TVariables>> & {
					returnPartialData: true;
				},
			): PreloadedQueryRef<TData, TVariables, 'complete' | 'streaming' | 'partial'>;
			/**
			 * @deprecated Avoid manually specifying generics on `preloadQuery`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your query results.
			 *
			 *
			 * A function that will begin loading a query when called. It's result can be
			 * read by `useReadQuery` which will suspend until the query is loaded.
			 * This is useful when you want to start loading a query as early as possible
			 * outside of a React component.
			 *
			 * @example
			 *
			 * ```js
			 * const preloadQuery = createQueryPreloader(client);
			 * const queryRef = preloadQuery(query, { variables, ...otherOptions });
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<div>Loading</div>}>
			 *       <MyQuery />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function MyQuery() {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   // do something with `data`
			 * }
			 * ```
			 */
			<TData, TVariables extends OperationVariables = OperationVariables>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables
					? [options?: PreloadQueryOptions<NoInfer<TVariables>>]
					: [options: PreloadQueryOptions<NoInfer<TVariables>>]
			): PreloadedQueryRef<TData, TVariables, 'complete' | 'streaming'>;
		}
		/**
		 * A function that will begin loading a query when called. It's result can be
		 * read by `useReadQuery` which will suspend until the query is loaded.
		 * This is useful when you want to start loading a query as early as possible
		 * outside of a React component.
		 *
		 * @example
		 *
		 * ```js
		 * const preloadQuery = createQueryPreloader(client);
		 * const queryRef = preloadQuery(query, { variables, ...otherOptions });
		 *
		 * function App() {
		 *   return (
		 *     <Suspense fallback={<div>Loading</div>}>
		 *       <MyQuery />
		 *     </Suspense>
		 *   );
		 * }
		 *
		 * function MyQuery() {
		 *   const { data } = useReadQuery(queryRef);
		 *
		 *   // do something with `data`
		 * }
		 * ```
		 */
		interface Modern {
			/**
			 * A function that will begin loading a query when called. It's result can be
			 * read by `useReadQuery` which will suspend until the query is loaded.
			 * This is useful when you want to start loading a query as early as possible
			 * outside of a React component.
			 *
			 * @example
			 *
			 * ```js
			 * const preloadQuery = createQueryPreloader(client);
			 * const queryRef = preloadQuery(query, { variables, ...otherOptions });
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<div>Loading</div>}>
			 *       <MyQuery />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function MyQuery() {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   // do something with `data`
			 * }
			 * ```
			 */
			<TData, TVariables extends OperationVariables, TOptions extends never>(
				query: {} extends TVariables ? DocumentNode | TypedDocumentNode<TData, TVariables> : never,
			): PreloadQueryFunction.ResultForOptions<TData, TVariables, Record<string, never>>;
			/**
			 * A function that will begin loading a query when called. It's result can be
			 * read by `useReadQuery` which will suspend until the query is loaded.
			 * This is useful when you want to start loading a query as early as possible
			 * outside of a React component.
			 *
			 * @example
			 *
			 * ```js
			 * const preloadQuery = createQueryPreloader(client);
			 * const queryRef = preloadQuery(query, { variables, ...otherOptions });
			 *
			 * function App() {
			 *   return (
			 *     <Suspense fallback={<div>Loading</div>}>
			 *       <MyQuery />
			 *     </Suspense>
			 *   );
			 * }
			 *
			 * function MyQuery() {
			 *   const { data } = useReadQuery(queryRef);
			 *
			 *   // do something with `data`
			 * }
			 * ```
			 */
			<
				TData,
				TVariables extends OperationVariables,
				TOptions extends PreloadQueryOptions<NoInfer<TVariables>> &
					VariablesOption<
						TVariables & {
							[K in Exclude<keyof TOptions['variables'], keyof TVariables>]?: never;
						}
					>,
			>(
				query: DocumentNode | TypedDocumentNode<TData, TVariables>,
				...[options]: {} extends TVariables ? [options?: TOptions] : [options: TOptions]
			): PreloadQueryFunction.ResultForOptions<TData, TVariables, TOptions>;
		}
		type Evaluated = SignatureStyle extends 'classic' ? Classic : Modern;
	}
}
/**
 * A higher order function that returns a `preloadQuery` function which
 * can be used to begin loading a query with the given `client`. This is useful
 * when you want to start loading a query as early as possible outside of a
 * React component.
 *
 * > Refer to the [Suspense - Initiating queries outside React](https://www.apollographql.com/docs/react/data/suspense#initiating-queries-outside-react) section for a more in-depth overview.
 *
 * @param client - The `ApolloClient` instance that will be used to load queries
 * from the returned `preloadQuery` function.
 * @returns The `preloadQuery` function.
 *
 * @example
 *
 * ```js
 * const preloadQuery = createQueryPreloader(client);
 * ```
 */
export declare function createQueryPreloader(client: ApolloClient): PreloadQueryFunction;
