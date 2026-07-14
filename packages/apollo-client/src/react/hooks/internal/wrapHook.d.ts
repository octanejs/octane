import type { ApolloClient } from '@apollo/client';
import type { ObservableQuery } from '@apollo/client';
import type { createQueryPreloader } from '@octanejs/apollo-client/react';
import type {
	useBackgroundQuery,
	useFragment,
	useQuery,
	useQueryRefHandlers,
	useReadQuery,
	useSuspenseFragment,
	useSuspenseQuery,
} from '@octanejs/apollo-client/react';
type FunctionSignature<T> = T extends (...args: infer A) => infer R ? (...args: A) => R : never;
interface WrappableHooks {
	createQueryPreloader: FunctionSignature<typeof createQueryPreloader>;
	useQuery: FunctionSignature<typeof useQuery>;
	useSuspenseQuery: FunctionSignature<typeof useSuspenseQuery>;
	useSuspenseFragment: FunctionSignature<typeof useSuspenseFragment>;
	useBackgroundQuery: FunctionSignature<typeof useBackgroundQuery>;
	useReadQuery: FunctionSignature<typeof useReadQuery>;
	useFragment: FunctionSignature<typeof useFragment>;
	useQueryRefHandlers: FunctionSignature<typeof useQueryRefHandlers>;
}
/**
 * @internal
 * Can be used to correctly type the [Symbol.for("apollo.hook.wrappers")] property of
 * `QueryManager`, to override/wrap hook functionality.
 *
 * @deprecated This is an internal API and should not be used directly. This can be removed or changed at any time.
 */
export type HookWrappers = {
	[K in keyof WrappableHooks]?: (originalHook: WrappableHooks[K]) => WrappableHooks[K];
};
/**
 * @internal
 *
 * Makes an Apollo Client hook "wrappable".
 * That means that the Apollo Client instance can expose a "wrapper" that will be
 * used to wrap the original hook implementation with additional logic.
 * @example
 *
 * ```tsx
 * // this is already done in `@apollo/client` for all wrappable hooks (see `WrappableHooks`)
 * // following this pattern
 * function useQuery() {
 *   return wrapHook('useQuery', _useQuery, options.client)(query, options);
 * }
 * function _useQuery(query, options) {
 *   // original implementation
 * }
 *
 * // this is what a library like `@apollo/client-react-streaming` would do
 * class ApolloClientWithStreaming extends ApolloClient {
 *   constructor(options) {
 *     super(options);
 *     this.queryManager[Symbol.for("apollo.hook.wrappers")] = {
 *       useQuery: (original) => (query, options) => {
 *         console.log("useQuery was called with options", options);
 *         return original(query, options);
 *       }
 *     }
 *   }
 * }
 *
 * // this will now log the options and then call the original `useQuery`
 * const client = new ApolloClientWithStreaming({ ... });
 * useQuery(query, { client });
 * ```
 *
 * @deprecated This is an internal API and should not be used directly. This can be removed or changed at any time.
 */
export declare function wrapHook<Hook extends (...args: any[]) => any>(
	hookName: keyof WrappableHooks,
	useHook: Hook,
	clientOrObsQuery: ObservableQuery<any> | ApolloClient,
): Hook;
export {};
