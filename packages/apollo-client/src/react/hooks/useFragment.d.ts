import type {
	ApolloClient,
	DataValue,
	DocumentNode,
	GetDataState,
	OperationVariables,
	TypedDocumentNode,
} from '@apollo/client';
import type { ApolloCache, MissingTree } from '@apollo/client/cache';
import type { MaybeMasked } from '@apollo/client/masking';
import type { NoInfer } from '@apollo/client/utilities/internal';
export declare namespace useFragment {
	import _self = useFragment;
	interface Options<TData, TVariables extends OperationVariables> {
		/**
		 * A GraphQL document created using the `gql` template string tag from
		 * `graphql-tag` with one or more fragments which will be used to determine
		 * the shape of data to read. If you provide more than one fragment in this
		 * document then you must also specify `fragmentName` to select a single.
		 */
		fragment: DocumentNode | TypedDocumentNode<TData, TVariables>;
		/**
		 * The name of the fragment in your GraphQL document to be used. If you do
		 * not provide a `fragmentName` and there is only one fragment in your
		 * `fragment` document then that fragment will be used.
		 */
		fragmentName?: string;
		/**
		 * Any variables that the GraphQL query may depend on.
		 */
		variables?: NoInfer<TVariables>;
		/**
		 * An object or array containing a `__typename` and primary key fields
		 * (such as `id`) identifying the entity object from which the fragment will
		 * be retrieved, or a `{ __ref: "..." }` reference, or a `string` ID (uncommon).
		 */
		from:
			useFragment.FromOptionValue<TData> | Array<useFragment.FromOptionValue<TData> | null> | null;
		/**
		 * Whether to read from optimistic or non-optimistic cache data. If
		 * this named option is provided, the optimistic parameter of the
		 * readQuery method can be omitted.
		 *
		 * @defaultValue true
		 */
		optimistic?: boolean;
		/**
		 * The instance of `ApolloClient` to use to look up the fragment.
		 *
		 * By default, the instance that's passed down via context is used, but you
		 * can provide a different instance here.
		 *
		 * @docGroup 1. Operation options
		 */
		client?: ApolloClient;
	}
	namespace DocumentationTypes {
		namespace useFragment {
			interface Options<
				TData = unknown,
				TVariables extends OperationVariables = OperationVariables,
			> extends _self.Options<TData, TVariables> {}
		}
	}
	/**
	 * Acceptable values provided to the `from` option.
	 */
	type FromOptionValue<TData> = ApolloCache.FromOptionValue<TData>;
	type Result<TData> =
		| ({
				/**
				 *
				 */
				complete: true;
				/**
				 * A tree of all `MissingFieldError` messages reported during fragment reading, where the branches of the tree indicate the paths of the errors within the query result.
				 */
				missing?: never;
		  } & GetDataState<MaybeMasked<TData>, 'complete'>)
		| {
				/**
				 *
				 */
				complete: false;
				/**
				 * A tree of all `MissingFieldError` messages reported during fragment reading, where the branches of the tree indicate the paths of the errors within the query result.
				 */
				missing?: MissingTree;
				/**
				 * An object containing the result of your GraphQL query after it completes.
				 *
				 * This value might be `undefined` if a query results in one or more errors (depending on the query's `errorPolicy`).
				 *
				 * @docGroup 1. Operation data
				 */
				data: TData extends Array<infer TItem>
					? Array<DataValue.Partial<TItem> | null>
					: DataValue.Partial<TData>;
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
				dataState: 'partial';
		  };
	namespace DocumentationTypes {
		namespace useFragment {
			interface Result<TData> {
				data: MaybeMasked<TData> | DataValue.Partial<MaybeMasked<TData>>;
				complete: boolean;
				/**
				 * A tree of all `MissingFieldError` messages reported during fragment reading, where the branches of the tree indicate the paths of the errors within the query result.
				 */
				missing?: MissingTree;
			}
		}
	}
	namespace DocumentationTypes {
		/**
		 * `useFragment` represents a lightweight live binding into the Apollo Client Cache and enables Apollo Client to broadcast very specific fragment results to individual components. This hook returns an always-up-to-date view of whatever data the cache currently contains for a given fragment. `useFragment` never triggers network requests of its own.
		 *
		 * Note that the `useQuery` hook remains the primary hook responsible for querying and populating data in the cache ([see the API reference](./hooks#usequery)). As a result, the component reading the fragment data via `useFragment` is still subscribed to all changes in the query data, but receives updates only when that fragment's specific data change.
		 *
		 * To view a `useFragment` example, see the [Fragments](https://www.apollographql.com/docs/react/data/fragments#usefragment) page.
		 */
		function useFragment<
			TData = unknown,
			TVariables extends OperationVariables = OperationVariables,
		>({
			fragment,
			from,
			fragmentName,
			variables,
			optimistic,
			client,
		}: useFragment.Options<TData, TVariables>): useFragment.Result<TData>;
	}
}
/**
 * `useFragment` represents a lightweight live binding into the Apollo Client Cache and enables Apollo Client to broadcast very specific fragment results to individual components. This hook returns an always-up-to-date view of whatever data the cache currently contains for a given fragment. `useFragment` never triggers network requests of its own.
 *
 * Note that the `useQuery` hook remains the primary hook responsible for querying and populating data in the cache ([see the API reference](./hooks#usequery)). As a result, the component reading the fragment data via `useFragment` is still subscribed to all changes in the query data, but receives updates only when that fragment's specific data change.
 *
 * To view a `useFragment` example, see the [Fragments](https://www.apollographql.com/docs/react/data/fragments#usefragment) page.
 */
export declare function useFragment<
	TData = unknown,
	TVariables extends OperationVariables = OperationVariables,
>(
	options: useFragment.Options<TData, TVariables> & {
		from: Array<useFragment.FromOptionValue<TData>>;
	},
): useFragment.Result<Array<TData>>;
/**
 * `useFragment` represents a lightweight live binding into the Apollo Client Cache and enables Apollo Client to broadcast very specific fragment results to individual components. This hook returns an always-up-to-date view of whatever data the cache currently contains for a given fragment. `useFragment` never triggers network requests of its own.
 *
 * Note that the `useQuery` hook remains the primary hook responsible for querying and populating data in the cache ([see the API reference](./hooks#usequery)). As a result, the component reading the fragment data via `useFragment` is still subscribed to all changes in the query data, but receives updates only when that fragment's specific data change.
 *
 * To view a `useFragment` example, see the [Fragments](https://www.apollographql.com/docs/react/data/fragments#usefragment) page.
 */
export declare function useFragment<
	TData = unknown,
	TVariables extends OperationVariables = OperationVariables,
>(
	options: useFragment.Options<TData, TVariables> & {
		from: Array<null>;
	},
): useFragment.Result<Array<null>>;
/**
 * `useFragment` represents a lightweight live binding into the Apollo Client Cache and enables Apollo Client to broadcast very specific fragment results to individual components. This hook returns an always-up-to-date view of whatever data the cache currently contains for a given fragment. `useFragment` never triggers network requests of its own.
 *
 * Note that the `useQuery` hook remains the primary hook responsible for querying and populating data in the cache ([see the API reference](./hooks#usequery)). As a result, the component reading the fragment data via `useFragment` is still subscribed to all changes in the query data, but receives updates only when that fragment's specific data change.
 *
 * To view a `useFragment` example, see the [Fragments](https://www.apollographql.com/docs/react/data/fragments#usefragment) page.
 */
export declare function useFragment<
	TData = unknown,
	TVariables extends OperationVariables = OperationVariables,
>(
	options: useFragment.Options<TData, TVariables> & {
		from: Array<useFragment.FromOptionValue<TData> | null>;
	},
): useFragment.Result<Array<TData | null>>;
/**
 * `useFragment` represents a lightweight live binding into the Apollo Client Cache and enables Apollo Client to broadcast very specific fragment results to individual components. This hook returns an always-up-to-date view of whatever data the cache currently contains for a given fragment. `useFragment` never triggers network requests of its own.
 *
 * Note that the `useQuery` hook remains the primary hook responsible for querying and populating data in the cache ([see the API reference](./hooks#usequery)). As a result, the component reading the fragment data via `useFragment` is still subscribed to all changes in the query data, but receives updates only when that fragment's specific data change.
 *
 * To view a `useFragment` example, see the [Fragments](https://www.apollographql.com/docs/react/data/fragments#usefragment) page.
 */
export declare function useFragment<
	TData = unknown,
	TVariables extends OperationVariables = OperationVariables,
>(options: useFragment.Options<TData, TVariables>): useFragment.Result<TData>;
