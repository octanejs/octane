import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { DocumentNode } from 'graphql';
import type {
	ApolloClient,
	DefaultContext,
	ErrorLike,
	ErrorPolicy,
	FetchPolicy,
	OperationVariables,
} from '@apollo/client';
import type { MaybeMasked } from '@apollo/client/masking';
import type { DocumentationTypes as UtilityDocumentationTypes } from '@apollo/client/utilities/internal';
import type { NoInfer, VariablesOption } from '@apollo/client/utilities/internal';
export declare namespace useSubscription {
	import _self = useSubscription;
	namespace Base {
		interface Options<TData = unknown, TVariables extends OperationVariables = OperationVariables> {
			/**
			 * How you want your component to interact with the Apollo cache. For details, see [Setting a fetch policy](https://www.apollographql.com/docs/react/data/queries/#setting-a-fetch-policy).
			 */
			fetchPolicy?: FetchPolicy;
			/**
			 * Specifies the `ErrorPolicy` to be used for this operation
			 */
			errorPolicy?: ErrorPolicy;
			/**
			 * Determines if your subscription should be unsubscribed and subscribed again when an input to the hook (such as `subscription` or `variables`) changes.
			 */
			shouldResubscribe?: boolean | ((options: Options<TData, TVariables>) => boolean);
			/**
			 * An `ApolloClient` instance. By default `useSubscription` / `Subscription` uses the client passed down via context, but a different client can be passed in.
			 */
			client?: ApolloClient;
			/**
			 * Determines if the current subscription should be skipped. Useful if, for example, variables depend on previous queries and are not ready yet.
			 */
			skip?: boolean;
			/**
			 * Shared context between your component and your network interface (Apollo Link).
			 */
			context?: DefaultContext;
			/**
			 * Shared context between your component and your network interface (Apollo Link).
			 */
			extensions?: Record<string, any>;
			/**
			 * Allows the registration of a callback function that will be triggered each time the `useSubscription` Hook / `Subscription` component completes the subscription.
			 */
			onComplete?: () => void;
			/**
			 * Allows the registration of a callback function that will be triggered each time the `useSubscription` Hook / `Subscription` component receives data. The callback `options` object param consists of the current Apollo Client instance in `client`, and the received subscription data in `data`.
			 */
			onData?: (options: OnDataOptions<TData>) => any;
			/**
			 * Allows the registration of a callback function that will be triggered each time the `useSubscription` Hook / `Subscription` component receives an error.
			 */
			onError?: (error: ErrorLike) => void;
			/**
			 * If `true`, the hook will not cause the component to rerender. This is useful when you want to control the rendering of your component yourself with logic in the `onData` and `onError` callbacks.
			 *
			 * Changing this to `true` when the hook already has `data` will reset the `data` to `undefined`.
			 *
			 * @defaultValue `false`
			 */
			ignoreResults?: boolean;
		}
	}
	type Options<
		TData = unknown,
		TVariables extends OperationVariables = OperationVariables,
	> = Base.Options<TData, TVariables> & VariablesOption<TVariables>;
	namespace DocumentationTypes {
		namespace useSubscription {
			interface Options<TData = unknown, TVariables extends OperationVariables = OperationVariables>
				extends
					Base.Options<TData, TVariables>,
					UtilityDocumentationTypes.VariableOptions<TVariables> {}
		}
	}
	interface Result<TData = unknown> {
		/**
		 * A boolean that indicates whether any initial data has been returned
		 */
		loading: boolean;
		/**
		 * An object containing the result of your GraphQL subscription. Defaults to an empty object.
		 */
		data?: MaybeMasked<TData>;
		/**
		 * A runtime error with `graphQLErrors` and `networkError` properties
		 */
		error?: ErrorLike;
		/**
		 * A function that when called will disconnect and reconnect the connection
		 * to the subscription. If the subscription is deduplicated, this will
		 * restart the connection for all deduplicated subscriptions.
		 */
		restart: () => void;
	}
	namespace DocumentationTypes {
		namespace useSubscription {
			interface Result<TData = unknown> extends _self.Result<TData> {}
		}
	}
	namespace DocumentationTypes {
		/**
		 * > Refer to the [Subscriptions](https://www.apollographql.com/docs/react/data/subscriptions/) section for a more in-depth overview of `useSubscription`.
		 *
		 * @example
		 *
		 * ```jsx
		 * const COMMENTS_SUBSCRIPTION = gql`
		 *   subscription OnCommentAdded($repoFullName: String!) {
		 *     commentAdded(repoFullName: $repoFullName) {
		 *       id
		 *       content
		 *     }
		 *   }
		 * `;
		 *
		 * function DontReadTheComments({ repoFullName }) {
		 *   const {
		 *     data: { commentAdded },
		 *     loading,
		 *   } = useSubscription(COMMENTS_SUBSCRIPTION, { variables: { repoFullName } });
		 *   return <h4>New comment: {!loading && commentAdded.content}</h4>;
		 * }
		 * ```
		 *
		 * @remarks
		 *
		 * #### Consider using `onData` instead of `useEffect`
		 *
		 * If you want to react to incoming data, please use the `onData` option instead of `useEffect`.
		 * State updates you make inside a `useEffect` hook might cause additional rerenders, and `useEffect` is mostly meant for side effects of rendering, not as an event handler.
		 * State updates made in an event handler like `onData` might - depending on the React version - be batched and cause only a single rerender.
		 *
		 * Consider the following component:
		 *
		 * ```jsx
		 * export function Subscriptions() {
		 *   const { data, error, loading } = useSubscription(query);
		 *   const [accumulatedData, setAccumulatedData] = useState([]);
		 *
		 *   useEffect(() => {
		 *     setAccumulatedData((prev) => [...prev, data]);
		 *   }, [data]);
		 *
		 *   return (
		 *     <>
		 *       {loading && <p>Loading...</p>}
		 *       {JSON.stringify(accumulatedData, undefined, 2)}
		 *     </>
		 *   );
		 * }
		 * ```
		 *
		 * Instead of using `useEffect` here, we can re-write this component to use the `onData` callback function accepted in `useSubscription`'s `options` object:
		 *
		 * ```jsx
		 * export function Subscriptions() {
		 *   const [accumulatedData, setAccumulatedData] = useState([]);
		 *   const { data, error, loading } = useSubscription(query, {
		 *     onData({ data }) {
		 *       setAccumulatedData((prev) => [...prev, data.data]);
		 *     },
		 *   });
		 *
		 *   return (
		 *     <>
		 *       {loading && <p>Loading...</p>}
		 *       {JSON.stringify(accumulatedData, undefined, 2)}
		 *     </>
		 *   );
		 * }
		 * ```
		 *
		 * > ⚠️ **Note:** The `useSubscription` option `onData` is available in Apollo Client >= 3.7. In previous versions, the equivalent option is named `onSubscriptionData`.
		 *
		 * Now, the first message will be added to the `accumulatedData` array since `onData` is called _before_ the component re-renders. React 18 automatic batching is still in effect and results in a single re-render, but with `onData` we can guarantee each message received after the component mounts is added to `accumulatedData`.
		 *
		 * @param subscription - A GraphQL subscription document parsed into an AST by `gql`.
		 * @param options - Options to control how the subscription is executed.
		 * @returns Query result object
		 */
		function useSubscription<
			TData = unknown,
			TVariables extends OperationVariables = OperationVariables,
		>(options?: useSubscription.Options<TData, TVariables>): useSubscription.Result<TData>;
	}
	type OnDataResult<TData = unknown> = Omit<Result<TData>, 'restart'>;
	interface OnDataOptions<TData = unknown> {
		client: ApolloClient;
		data: OnDataResult<TData>;
	}
	interface OnSubscriptionDataOptions<TData = unknown> {
		client: ApolloClient;
		subscriptionData: OnDataResult<TData>;
	}
}
/**
 * > Refer to the [Subscriptions](https://www.apollographql.com/docs/react/data/subscriptions/) section for a more in-depth overview of `useSubscription`.
 *
 * @example
 *
 * ```jsx
 * const COMMENTS_SUBSCRIPTION = gql`
 *   subscription OnCommentAdded($repoFullName: String!) {
 *     commentAdded(repoFullName: $repoFullName) {
 *       id
 *       content
 *     }
 *   }
 * `;
 *
 * function DontReadTheComments({ repoFullName }) {
 *   const {
 *     data: { commentAdded },
 *     loading,
 *   } = useSubscription(COMMENTS_SUBSCRIPTION, { variables: { repoFullName } });
 *   return <h4>New comment: {!loading && commentAdded.content}</h4>;
 * }
 * ```
 *
 * @remarks
 *
 * #### Consider using `onData` instead of `useEffect`
 *
 * If you want to react to incoming data, please use the `onData` option instead of `useEffect`.
 * State updates you make inside a `useEffect` hook might cause additional rerenders, and `useEffect` is mostly meant for side effects of rendering, not as an event handler.
 * State updates made in an event handler like `onData` might - depending on the React version - be batched and cause only a single rerender.
 *
 * Consider the following component:
 *
 * ```jsx
 * export function Subscriptions() {
 *   const { data, error, loading } = useSubscription(query);
 *   const [accumulatedData, setAccumulatedData] = useState([]);
 *
 *   useEffect(() => {
 *     setAccumulatedData((prev) => [...prev, data]);
 *   }, [data]);
 *
 *   return (
 *     <>
 *       {loading && <p>Loading...</p>}
 *       {JSON.stringify(accumulatedData, undefined, 2)}
 *     </>
 *   );
 * }
 * ```
 *
 * Instead of using `useEffect` here, we can re-write this component to use the `onData` callback function accepted in `useSubscription`'s `options` object:
 *
 * ```jsx
 * export function Subscriptions() {
 *   const [accumulatedData, setAccumulatedData] = useState([]);
 *   const { data, error, loading } = useSubscription(query, {
 *     onData({ data }) {
 *       setAccumulatedData((prev) => [...prev, data.data]);
 *     },
 *   });
 *
 *   return (
 *     <>
 *       {loading && <p>Loading...</p>}
 *       {JSON.stringify(accumulatedData, undefined, 2)}
 *     </>
 *   );
 * }
 * ```
 *
 * > ⚠️ **Note:** The `useSubscription` option `onData` is available in Apollo Client >= 3.7. In previous versions, the equivalent option is named `onSubscriptionData`.
 *
 * Now, the first message will be added to the `accumulatedData` array since `onData` is called _before_ the component re-renders. React 18 automatic batching is still in effect and results in a single re-render, but with `onData` we can guarantee each message received after the component mounts is added to `accumulatedData`.
 *
 * @param subscription - A GraphQL subscription document parsed into an AST by `gql`.
 * @param options - Options to control how the subscription is executed.
 * @returns Query result object
 */
export declare function useSubscription<
	TData = unknown,
	TVariables extends OperationVariables = OperationVariables,
>(
	subscription: DocumentNode | TypedDocumentNode<TData, TVariables>,
	...[options]: {} extends TVariables
		? [options?: useSubscription.Options<NoInfer<TData>, NoInfer<TVariables>>]
		: [options: useSubscription.Options<NoInfer<TData>, NoInfer<TVariables>>]
): useSubscription.Result<TData>;
