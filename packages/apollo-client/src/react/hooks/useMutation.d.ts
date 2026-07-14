import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type {
	ApolloCache,
	ApolloClient,
	DefaultContext,
	DocumentNode,
	ErrorLike,
	ErrorPolicy,
	InternalRefetchQueriesInclude,
	MaybeMasked,
	MutationFetchPolicy,
	MutationQueryReducersMap,
	MutationUpdaterFunction,
	NormalizedExecutionResult,
	OnQueryUpdated,
	OperationVariables,
	Unmasked,
} from '@apollo/client';
import type { IgnoreModifier } from '@apollo/client/cache';
import type {
	LazyType,
	NoInfer,
	Prettify,
	SignatureStyle,
} from '@apollo/client/utilities/internal';
type MakeRequiredVariablesOptional<
	TVariables extends OperationVariables,
	TConfiguredVariables extends Partial<TVariables>,
> = Prettify<
	{
		[K in keyof TVariables as K extends keyof TConfiguredVariables ? K : never]?: TVariables[K];
	} & Omit<TVariables, keyof TConfiguredVariables>
>;
type ExtractConfiguredVariables<
	TOptions,
	TVariables extends OperationVariables,
> = 'variables' extends keyof TOptions
	? Exclude<TOptions['variables'], undefined> extends infer V
		? [V] extends [never]
			? {}
			: V extends Partial<TVariables>
				? V
				: {}
		: {}
	: {};
export declare namespace useMutation {
	interface Options<
		TData = unknown,
		TVariables extends OperationVariables = OperationVariables,
		TCache extends ApolloCache = ApolloCache,
		TConfiguredVariables extends Partial<TVariables> = Partial<TVariables>,
	> {
		/**
		 * By providing either an object or a callback function that, when invoked after
		 * a mutation, allows you to return optimistic data and optionally skip updates
		 * via the `IGNORE` sentinel object, Apollo Client caches this temporary
		 * (and potentially incorrect) response until the mutation completes, enabling
		 * more responsive UI updates.
		 *
		 * For more information, see [Optimistic mutation results](https://www.apollographql.com/docs/react/performance/optimistic-ui/).
		 *
		 * @docGroup 3. Caching options
		 */
		optimisticResponse?:
			| Unmasked<NoInfer<TData>>
			| ((
					vars: TVariables,
					{
						IGNORE,
					}: {
						IGNORE: IgnoreModifier;
					},
			  ) => Unmasked<NoInfer<TData>> | IgnoreModifier);
		/**
		 * A `MutationQueryReducersMap`, which is map from query names to
		 * mutation query reducers. Briefly, this map defines how to incorporate the
		 * results of the mutation into the results of queries that are currently
		 * being watched by your application.
		 */
		updateQueries?: MutationQueryReducersMap<TData>;
		/**
		 * An array (or a function that _returns_ an array) that specifies which queries you want to refetch after the mutation occurs.
		 *
		 * Each array value can be either:
		 *
		 * - An object containing the `query` to execute, along with any `variables`
		 *
		 * - A string indicating the operation name of the query to refetch
		 *
		 * @docGroup 1. Operation options
		 */
		refetchQueries?:
			| ((result: NormalizedExecutionResult<Unmasked<TData>>) => InternalRefetchQueriesInclude)
			| InternalRefetchQueriesInclude;
		/**
		 * If `true`, makes sure all queries included in `refetchQueries` are completed before the mutation is considered complete.
		 *
		 * The default value is `false` (queries are refetched asynchronously).
		 *
		 * @docGroup 1. Operation options
		 */
		awaitRefetchQueries?: boolean;
		/**
		 * A function used to update the Apollo Client cache after the mutation completes.
		 *
		 * For more information, see [Updating the cache after a mutation](https://www.apollographql.com/docs/react/data/mutations#updating-the-cache-after-a-mutation).
		 *
		 * @docGroup 3. Caching options
		 */
		update?: MutationUpdaterFunction<TData, TVariables, TCache>;
		/**
		 * Optional callback for intercepting queries whose cache data has been updated by the mutation, as well as any queries specified in the `refetchQueries: [...]` list passed to `client.mutate`.
		 *
		 * Returning a `Promise` from `onQueryUpdated` will cause the final mutation `Promise` to await the returned `Promise`. Returning `false` causes the query to be ignored.
		 *
		 * @docGroup 1. Operation options
		 */
		onQueryUpdated?: OnQueryUpdated<any>;
		/**
		 * Specifies how the mutation handles a response that returns both GraphQL errors and partial results.
		 *
		 * For details, see [GraphQL error policies](https://www.apollographql.com/docs/react/data/error-handling/#graphql-error-policies).
		 *
		 * The default value is `none`, meaning that the mutation result includes error details but _not_ partial results.
		 *
		 * @docGroup 1. Operation options
		 */
		errorPolicy?: ErrorPolicy;
		/**
		 * An object containing all of the GraphQL variables your mutation requires to execute.
		 *
		 * Each key in the object corresponds to a variable name, and that key's value corresponds to the variable value.
		 *
		 * @docGroup 1. Operation options
		 */
		variables?: Partial<TVariables> & TConfiguredVariables;
		/**
		 * If you're using [Apollo Link](https://www.apollographql.com/docs/react/api/link/introduction/), this object is the initial value of the `context` object that's passed along your link chain.
		 *
		 * @docGroup 2. Networking options
		 */
		context?: DefaultContext;
		/**
		 * Provide `no-cache` if the mutation's result should _not_ be written to the Apollo Client cache.
		 *
		 * The default value is `network-only` (which means the result _is_ written to the cache).
		 *
		 * Unlike queries, mutations _do not_ support [fetch policies](https://www.apollographql.com/docs/react/data/queries/#setting-a-fetch-policy) besides `network-only` and `no-cache`.
		 *
		 * @docGroup 3. Caching options
		 */
		fetchPolicy?: MutationFetchPolicy;
		/**
		 * To avoid retaining sensitive information from mutation root field
		 * arguments, Apollo Client v3.4+ automatically clears any `ROOT_MUTATION`
		 * fields from the cache after each mutation finishes. If you need this
		 * information to remain in the cache, you can prevent the removal by passing
		 * `keepRootFields: true` to the mutation. `ROOT_MUTATION` result data are
		 * also passed to the mutation `update` function, so we recommend obtaining
		 * the results that way, rather than using this option, if possible.
		 */
		keepRootFields?: boolean;
		/**
		 * The instance of `ApolloClient` to use to execute the mutation.
		 *
		 * By default, the instance that's passed down via context is used, but you can provide a different instance here.
		 *
		 * @docGroup 2. Networking options
		 */
		client?: ApolloClient;
		/**
		 * If `true`, the in-progress mutation's associated component re-renders whenever the network status changes or a network error occurs.
		 *
		 * The default value is `true`.
		 *
		 * @docGroup 2. Networking options
		 */
		notifyOnNetworkStatusChange?: boolean;
		/**
		 * A callback function that's called when your mutation successfully completes with zero errors (or if `errorPolicy` is `ignore` and partial data is returned).
		 *
		 * This function is passed the mutation's result `data` and any options passed to the mutation.
		 *
		 * @docGroup 1. Operation options
		 */
		onCompleted?: (
			data: MaybeMasked<TData>,
			clientOptions?: Options<TData, TVariables, TCache>,
		) => void;
		/**
		 * A callback function that's called when the mutation encounters one or more errors (unless `errorPolicy` is `ignore`).
		 *
		 * This function is passed an [`ApolloError`](https://github.com/apollographql/apollo-client/blob/d96f4578f89b933c281bb775a39503f6cdb59ee8/src/errors/index.ts#L36-L39) object that contains either a `networkError` object or a `graphQLErrors` array, depending on the error(s) that occurred, as well as any options passed the mutation.
		 *
		 * @docGroup 1. Operation options
		 */
		onError?: (error: ErrorLike, clientOptions?: Options<TData, TVariables, TCache>) => void;
	}
	namespace Base {
		interface Result {
			/**
			 * If `true`, the mutation is currently in flight.
			 */
			loading: boolean;
			/**
			 * If `true`, the mutation's mutate function has been called.
			 */
			called: boolean;
			/**
			 * The instance of Apollo Client that executed the mutation.
			 *
			 * Can be useful for manually executing followup operations or writing data to the cache.
			 */
			client: ApolloClient;
			/**
			 * A function that you can call to reset the mutation's result to its initial, uncalled state.
			 */
			reset: () => void;
		}
	}
	/**
	 * Maps `errorPolicy` to the shape of `data` and `error` as observable from
	 * the hook result state.
	 *
	 * The hook has additional states (before call, during loading) where `data`
	 * and `error` are `undefined`, so `data` remains nullable even on error
	 * policies that would otherwise guarantee it. Only `error` is narrowed away
	 * for `"ignore"`, since the underlying `client.mutate` promise never rejects
	 * and never resolves with an error for that policy.
	 */
	type ResultStateMap<TData = unknown> = {
		none: {
			/**
			 * The data returned from your mutation. Can be `undefined` if the `errorPolicy`
			 * is `all` or `ignore` and the server returns a GraphQL response with `errors`
			 * but not `data` or a network error is returned.
			 */
			data: MaybeMasked<TData> | null | undefined;
			/**
			 * If the mutation produces one or more errors, this object contains either an array of `graphQLErrors` or a single `networkError`. Otherwise, this value is `undefined`.
			 *
			 * For more information, see [Handling operation errors](https://www.apollographql.com/docs/react/data/error-handling/).
			 */
			error: ErrorLike | undefined;
		};
		all: {
			/**
			 * The data returned from your mutation. Can be `undefined` if the `errorPolicy`
			 * is `all` or `ignore` and the server returns a GraphQL response with `errors`
			 * but not `data` or a network error is returned.
			 */
			data: MaybeMasked<TData> | null | undefined;
			/**
			 * If the mutation produces one or more errors, this object contains either an array of `graphQLErrors` or a single `networkError`. Otherwise, this value is `undefined`.
			 *
			 * For more information, see [Handling operation errors](https://www.apollographql.com/docs/react/data/error-handling/).
			 */
			error: ErrorLike | undefined;
		};
		ignore: {
			/**
			 * The data returned from your mutation. Can be `undefined` if the `errorPolicy`
			 * is `all` or `ignore` and the server returns a GraphQL response with `errors`
			 * but not `data` or a network error is returned.
			 */
			data: MaybeMasked<TData> | null | undefined;
			/**
			 * If the mutation produces one or more errors, this object contains either an array of `graphQLErrors` or a single `networkError`. Otherwise, this value is `undefined`.
			 *
			 * For more information, see [Handling operation errors](https://www.apollographql.com/docs/react/data/error-handling/).
			 */
			error: undefined;
		};
		undefined: {
			/**
			 * The data returned from your mutation. Can be `undefined` if the `errorPolicy`
			 * is `all` or `ignore` and the server returns a GraphQL response with `errors`
			 * but not `data` or a network error is returned.
			 */
			data: MaybeMasked<TData> | null | undefined;
			/**
			 * If the mutation produces one or more errors, this object contains either an array of `graphQLErrors` or a single `networkError`. Otherwise, this value is `undefined`.
			 *
			 * For more information, see [Handling operation errors](https://www.apollographql.com/docs/react/data/error-handling/).
			 */
			error: ErrorLike | undefined;
		};
	};
	type Result<
		TData = unknown,
		TErrorPolicy extends ErrorPolicy | undefined = undefined,
	> = Base.Result & ResultStateMap<TData>[`${TErrorPolicy}`];
	namespace DocumentationTypes {
		namespace useMutation {
			interface Result<TData = unknown> extends Base.Result {
				/**
				 * The data returned from your mutation. Can be `undefined` if the `errorPolicy`
				 * is `all` or `ignore` and the server returns a GraphQL response with `errors`
				 * but not `data` or a network error is returned.
				 */
				data: MaybeMasked<TData> | null | undefined;
				/**
				 * If the mutation produces one or more errors, this object contains either an array of `graphQLErrors` or a single `networkError`. Otherwise, this value is `undefined`.
				 *
				 * For more information, see [Handling operation errors](https://www.apollographql.com/docs/react/data/error-handling/).
				 */
				error: ErrorLike | undefined;
			}
		}
	}
	type ResultTuple<
		TData,
		TVariables extends OperationVariables,
		TCache extends ApolloCache = ApolloCache,
		TErrorPolicy extends ErrorPolicy | undefined = undefined,
	> = [
		mutate: MutationFunction<TData, TVariables, TCache, TErrorPolicy>,
		result: Result<TData, TErrorPolicy>,
	];
	type MutationFunction<
		TData,
		TVariables extends OperationVariables,
		TCache extends ApolloCache = ApolloCache,
		TErrorPolicy extends ErrorPolicy | undefined = undefined,
	> = (
		...[options]: {} extends TVariables
			? [
					options?: MutationFunctionOptions<TData, TVariables, TCache> & {
						/**
						 * An object containing all of the GraphQL variables your mutation requires to execute.
						 *
						 * Each key in the object corresponds to a variable name, and that key's value corresponds to the variable value.
						 *
						 * @docGroup 1. Operation options
						 */
						variables?: TVariables;
					},
				]
			: [
					options: MutationFunctionOptions<TData, TVariables, TCache> & {
						/**
						 * An object containing all of the GraphQL variables your mutation requires to execute.
						 *
						 * Each key in the object corresponds to a variable name, and that key's value corresponds to the variable value.
						 *
						 * @docGroup 1. Operation options
						 */
						variables: TVariables;
					},
				]
	) => Promise<ApolloClient.MutateResult<MaybeMasked<TData>, TErrorPolicy>>;
	type MutationFunctionOptions<
		TData = unknown,
		TVariables extends OperationVariables = OperationVariables,
		TCache extends ApolloCache = ApolloCache,
	> = Options<TData, TVariables, TCache> & {
		/**
		 * If you're using [Apollo Link](https://www.apollographql.com/docs/react/api/link/introduction/), this object is the initial value of the `context` object that's passed along your link chain.
		 *
		 * @docGroup 2. Networking options
		 *
		 *
		 * @remarks
		 * When provided as a callback function, the function is called with the
		 * value of `context` provided to the `useMutation` hook.
		 */
		context?: DefaultContext | ((hookContext: DefaultContext | undefined) => DefaultContext);
	};
	interface DefaultOptions extends ApolloClient.DefaultOptions.Mutate.Calculated {}
	type ResultForOptions<
		TData,
		TVariables extends OperationVariables,
		TCache extends ApolloCache,
		TOptions extends Record<string, never> | Options<TData, TVariables, TCache>,
		TErrorPolicy extends ErrorPolicy | undefined = undefined,
	> = LazyType<
		ResultTuple<
			TData,
			MakeRequiredVariablesOptional<TVariables, ExtractConfiguredVariables<TOptions, TVariables>>,
			TCache,
			[TErrorPolicy] extends [undefined]
				? DefaultOptions extends {
						errorPolicy: infer D;
					}
					? D
					: undefined
				: TErrorPolicy
		>
	>;
	namespace DocumentationTypes {
		/**
		 * > Refer to the [Mutations](https://www.apollographql.com/docs/react/data/mutations/) section for a more in-depth overview of `useMutation`.
		 *
		 * @example
		 *
		 * ```jsx
		 * import { gql, useMutation } from "@apollo/client";
		 *
		 * const ADD_TODO = gql`
		 *   mutation AddTodo($type: String!) {
		 *     addTodo(type: $type) {
		 *       id
		 *       type
		 *     }
		 *   }
		 * `;
		 *
		 * function AddTodo() {
		 *   let input;
		 *   const [addTodo, { data }] = useMutation(ADD_TODO);
		 *
		 *   return (
		 *     <div>
		 *       <form
		 *         onSubmit={(e) => {
		 *           e.preventDefault();
		 *           addTodo({ variables: { type: input.value } });
		 *           input.value = "";
		 *         }}
		 *       >
		 *         <input
		 *           ref={(node) => {
		 *             input = node;
		 *           }}
		 *         />
		 *         <button type="submit">Add Todo</button>
		 *       </form>
		 *     </div>
		 *   );
		 * }
		 * ```
		 *
		 * @param mutation - A GraphQL mutation document parsed into an AST by `gql`.
		 * @param options - Options to control how the mutation is executed.
		 * @returns A tuple in the form of `[mutate, result]`
		 */
		interface useMutation {
			<TData = unknown, TVariables extends OperationVariables = OperationVariables>(
				mutation: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options?: Options<TData, TVariables>,
			): ResultTuple<TData, TVariables>;
		}
	}
	namespace Signatures {
		/**
		 *
		 */
		interface Classic {
			/**
			 *
			 */
			<
				TData,
				TVariables extends OperationVariables,
				_INFERENCE_ONLY_DO_NOT_SPECIFY extends 'inferred',
				TConfiguredVariables extends Partial<TVariables> = {},
				TErrorPolicy extends ErrorPolicy | undefined = undefined,
			>(
				mutation: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options?: useMutation.Options<
					NoInfer<TData>,
					NoInfer<TVariables>,
					ApolloCache,
					{
						[K in keyof TConfiguredVariables]: K extends keyof TVariables
							? TConfiguredVariables[K]
							: never;
					}
				> & {
					/**
					 * Specifies how the mutation handles a response that returns both GraphQL errors and partial results.
					 *
					 * For details, see [GraphQL error policies](https://www.apollographql.com/docs/react/data/error-handling/#graphql-error-policies).
					 *
					 * The default value is `none`, meaning that the mutation result includes error details but _not_ partial results.
					 *
					 * @docGroup 1. Operation options
					 */
					errorPolicy?: TErrorPolicy;
				},
			): useMutation.ResultTuple<
				TData,
				MakeRequiredVariablesOptional<TVariables, TConfiguredVariables>,
				ApolloCache,
				TErrorPolicy
			>;
			/**
			 * @deprecated Avoid manually specifying generics on `useMutation`.
			 * Instead, rely on TypeScript's type inference along with a correctly typed `TypedDocumentNode` to get accurate types for your mutation results.
			 */
			<
				TData,
				TVariables extends OperationVariables = OperationVariables,
				TCache extends ApolloCache = ApolloCache,
				TConfiguredVariables extends Partial<TVariables> = {},
				TErrorPolicy extends ErrorPolicy | undefined = undefined,
			>(
				mutation: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options?: useMutation.Options<
					NoInfer<TData>,
					NoInfer<TVariables>,
					TCache,
					{
						[K in keyof TConfiguredVariables]: K extends keyof TVariables
							? TConfiguredVariables[K]
							: never;
					}
				> &
					(TErrorPolicy extends undefined
						? {}
						: {
								/**
								 * Specifies how the mutation handles a response that returns both GraphQL errors and partial results.
								 *
								 * For details, see [GraphQL error policies](https://www.apollographql.com/docs/react/data/error-handling/#graphql-error-policies).
								 *
								 * The default value is `none`, meaning that the mutation result includes error details but _not_ partial results.
								 *
								 * @docGroup 1. Operation options
								 */
								errorPolicy: TErrorPolicy;
							}),
			): useMutation.ResultTuple<
				TData,
				MakeRequiredVariablesOptional<TVariables, TConfiguredVariables>,
				TCache,
				TErrorPolicy
			>;
		}
		/**
		 *
		 */
		interface Modern {
			/**
			 *
			 */
			<
				TData,
				TVariables extends OperationVariables,
				TCache extends ApolloCache,
				TOptions extends never,
			>(
				mutation: DocumentNode | TypedDocumentNode<TData, TVariables>,
			): useMutation.ResultForOptions<TData, TVariables, TCache, Record<string, never>>;
			/**
			 *
			 */
			<
				TData,
				TVariables extends OperationVariables,
				TCache extends ApolloCache,
				TOptions extends useMutation.Options<NoInfer<TData>, NoInfer<TVariables>, TCache> & {
					variables?: {
						[K in Exclude<keyof TOptions['variables'], keyof TVariables>]?: never;
					};
				},
				TErrorPolicy extends ErrorPolicy | undefined = undefined,
			>(
				mutation: DocumentNode | TypedDocumentNode<TData, TVariables>,
				options?: TOptions & {
					/**
					 * Specifies how the mutation handles a response that returns both GraphQL errors and partial results.
					 *
					 * For details, see [GraphQL error policies](https://www.apollographql.com/docs/react/data/error-handling/#graphql-error-policies).
					 *
					 * The default value is `none`, meaning that the mutation result includes error details but _not_ partial results.
					 *
					 * @docGroup 1. Operation options
					 */
					errorPolicy?: TErrorPolicy;
				},
			): useMutation.ResultForOptions<TData, TVariables, TCache, TOptions, TErrorPolicy>;
		}
		type Evaluated = SignatureStyle extends 'classic' ? Classic : Modern;
	}
	/**
	 *
	 */
	interface Signature extends Signatures.Evaluated {}
}
/**
 *
 */
export declare const useMutation: useMutation.Signature;
export {};
