import type { ApolloClient } from '@apollo/client';
/**
 * @example
 *
 * ```jsx
 * import { useApolloClient } from "@octanejs/apollo-client/react";
 *
 * function SomeComponent() {
 *   const client = useApolloClient();
 *   // `client` is now set to the `ApolloClient` instance being used by the
 *   // application (that was configured using something like `ApolloProvider`)
 * }
 * ```
 *
 * @returns The `ApolloClient` instance being used by the application.
 */
export declare function useApolloClient(override?: ApolloClient): ApolloClient;
