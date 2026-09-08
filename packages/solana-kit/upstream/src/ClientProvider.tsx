import type { Client } from '@solana/kit';
import React from 'react';

import { usePromise } from './usePromise';

const ClientContext = /*#__PURE__*/ React.createContext<Client<object> | null>(null);

/**
 * The React context that holds the Kit client published by the nearest {@link ClientProvider}.
 * Exported for advanced cases such as third-party providers that wrap and extend the client; most
 * consumers should reach for {@link useClient} or one of the higher-level hooks instead.
 */
export { ClientContext };

/**
 * Props accepted by {@link ClientProvider}.
 */
export type ClientProviderProps = Readonly<{
    children?: React.ReactNode;
    /**
     * The Kit client to publish to descendants, or a promise resolving to one (e.g. when the
     * client has async plugins). The reference must be stable across renders — build it at
     * module scope or memoise it with `useMemo` when its config is reactive.
     */
    client: Client<object> | Promise<Client<object>>;
}>;

/**
 * Publishes a caller-owned Kit client to its subtree. Required for `useClient`,
 * `useClientCapability`, and any plugin-specific hook that depends on a client capability.
 *
 * Plugin composition belongs in plain Kit — the provider does no composition, lifecycle
 * management, or disposal; it is a value channel, not a lifecycle channel. When config changes at
 * runtime (e.g. cluster toggle), rebuild the client in `useMemo` and pass the new reference; the
 * subtree resubscribes against the new client identity.
 *
 * Async client support: when `client` is a promise (e.g. `createClient().use(asyncPlugin())`),
 * the provider suspends the subtree via the nearest `<Suspense>` boundary until the promise
 * resolves. On React 19 this delegates to `React.use(promise)`; on React 18 a thrown-promise shim
 * keyed by promise identity preserves the same contract.
 *
 * @example Sync client
 * ```tsx
 * import { createClient } from '@solana/kit';
 * import { ClientProvider } from '@solana/react';
 *
 * const client = createClient(); // .use(...) plugins as needed
 *
 * function App() {
 *     return (
 *         <ClientProvider client={client}>
 *             <MyApp />
 *         </ClientProvider>
 *     );
 * }
 * ```
 *
 * @example Async client (Suspense)
 * ```tsx
 * const clientPromise = useMemo(
 *     () => createClient().use(someAsyncPlugin()),
 *     [],
 * );
 *
 * <Suspense fallback={<Splash />}>
 *     <ClientProvider client={clientPromise}>
 *         <Shell />
 *     </ClientProvider>
 * </Suspense>
 * ```
 *
 * @see {@link useClient}
 */
export function ClientProvider({ children, client }: ClientProviderProps): React.ReactElement {
    const resolved = usePromise(client);
    return <ClientContext.Provider value={resolved}>{children}</ClientContext.Provider>;
}
