import type {
	ApolloClient,
	DataValue,
	DocumentNode,
	OperationVariables,
	TypedDocumentNode,
} from '@apollo/client';
import type { ApolloCache } from '@apollo/client/cache';
import type { MaybeMasked } from '@apollo/client/masking';
import type {
	DocumentationTypes as UtilityDocumentationTypes,
	NoInfer,
	VariablesOption,
} from '@apollo/client/utilities/internal';
export declare namespace useSuspenseFragment {
	import _self = useSuspenseFragment;
	namespace Base {
		type Options<TData, TVariables extends OperationVariables> = {
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
			 * An object or array containing a `__typename` and primary key fields
			 * (such as `id`) identifying the entity object from which the fragment will
			 * be retrieved, or a `{ __ref: "..." }` reference, or a `string` ID (uncommon).
			 */
			from:
				| useSuspenseFragment.FromOptionValue<TData>
				| Array<useSuspenseFragment.FromOptionValue<TData> | null>
				| null;
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
		};
	}
	type Options<TData, TVariables extends OperationVariables> = Base.Options<TData, TVariables> &
		VariablesOption<NoInfer<TVariables>>;
	namespace DocumentationTypes {
		namespace useSuspenseFragment {
			interface Options<TData = unknown, TVariables extends OperationVariables = OperationVariables>
				extends
					Base.Options<TData, TVariables>,
					UtilityDocumentationTypes.VariableOptions<TVariables> {}
		}
	}
	/**
	 * Acceptable values provided to the `from` option.
	 */
	type FromOptionValue<TData> = ApolloCache.FromOptionValue<TData>;
	interface Result<TData> {
		data: DataValue.Complete<MaybeMasked<TData>>;
	}
	namespace DocumentationTypes {
		namespace useSuspenseFragment {
			interface Result<TData = unknown> extends _self.Result<TData> {}
		}
	}
	namespace DocumentationTypes {
		/**
		 * #TODO documentation
		 */
		function useSuspenseFragment<TData, TVariables extends OperationVariables = OperationVariables>(
			options: useSuspenseFragment.Options<TData, TVariables>,
		): useSuspenseFragment.Result<TData>;
	}
}
/** #TODO documentation */
export declare function useSuspenseFragment<
	TData = unknown,
	TVariables extends OperationVariables = OperationVariables,
>(
	options: useSuspenseFragment.Options<TData, TVariables> & {
		from: Array<useSuspenseFragment.FromOptionValue<TData>>;
	},
): useSuspenseFragment.Result<Array<TData>>;
/**
 * #TODO documentation
 */
export declare function useSuspenseFragment<
	TData = unknown,
	TVariables extends OperationVariables = OperationVariables,
>(
	options: useSuspenseFragment.Options<TData, TVariables> & {
		from: Array<null>;
	},
): useSuspenseFragment.Result<Array<null>>;
/**
 * #TODO documentation
 */
export declare function useSuspenseFragment<
	TData = unknown,
	TVariables extends OperationVariables = OperationVariables,
>(
	options: useSuspenseFragment.Options<TData, TVariables> & {
		from: Array<useSuspenseFragment.FromOptionValue<TData> | null>;
	},
): useSuspenseFragment.Result<Array<TData | null>>;
/**
 * #TODO documentation
 */
export declare function useSuspenseFragment<
	TData,
	TVariables extends OperationVariables = OperationVariables,
>(
	options: useSuspenseFragment.Options<TData, TVariables> & {
		from: useSuspenseFragment.FromOptionValue<TData>;
	},
): useSuspenseFragment.Result<TData>;
/**
 * #TODO documentation
 */
export declare function useSuspenseFragment<
	TData,
	TVariables extends OperationVariables = OperationVariables,
>(
	options: useSuspenseFragment.Options<TData, TVariables> & {
		from: null;
	},
): useSuspenseFragment.Result<null>;
/**
 * #TODO documentation
 */
export declare function useSuspenseFragment<
	TData,
	TVariables extends OperationVariables = OperationVariables,
>(
	options: useSuspenseFragment.Options<TData, TVariables> & {
		from: useSuspenseFragment.FromOptionValue<TData> | null;
	},
): useSuspenseFragment.Result<TData | null>;
/**
 * #TODO documentation
 */
export declare function useSuspenseFragment<
	TData,
	TVariables extends OperationVariables = OperationVariables,
>(options: useSuspenseFragment.Options<TData, TVariables>): useSuspenseFragment.Result<TData>;
