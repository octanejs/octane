import * as React from 'octane';
import { invariant } from '@apollo/client/utilities/invariant';
import { getApolloContext } from '../context/ApolloContext.js';
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
export function useApolloClient(override) {
	// A zero-argument custom hook call is compiled as useApolloClient(site).
	// ApolloClient is an object, so a symbol here can only be Octane's site.
	if (typeof override === 'symbol') override = undefined;
	const context = React.useContext(getApolloContext());
	const client = override || context.client;
	invariant(!!client, 28);
	return client;
}
