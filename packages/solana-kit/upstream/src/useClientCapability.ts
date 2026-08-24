import { type Client, SOLANA_ERROR__REACT__MISSING_CAPABILITY, SolanaError } from '@solana/kit';

import { useClient } from './useClient';

/**
 * Configuration for {@link useClientCapability}.
 */
export type UseClientCapabilityConfig = Readonly<{
    /**
     * The capability name (or names) the hook depends on. Each is checked against the client with
     * a runtime `in` test before the narrowed value is returned. Pass an array when the hook
     * needs multiple capabilities (e.g. `['rpc', 'rpcSubscriptions']`); the same `providerHint` is
     * used for any that's missing.
     */
    capability: string | readonly string[];
    /**
     * Name of the calling hook, surfaced in the missing-capability error so users can locate the
     * call site quickly.
     */
    hookName: string;
    /**
     * Free-form actionable hint shown alongside the error — usually a one-liner naming the plugin
     * (or family of plugins) the user should install.
     */
    providerHint: string;
}>;

/**
 * Reads the client from the nearest {@link ClientProvider} and asserts at mount that the
 * requested capability is installed, narrowing the return type via the generic. Throws a
 * {@link SolanaError} with code {@link SOLANA_ERROR__REACT__MISSING_CAPABILITY} when the
 * capability is absent — including the calling `hookName` and a `providerHint` so users can fix
 * the mistake without cross-referencing docs.
 *
 * Use this from the implementation of plugin-specific hooks. Apps that need ad-hoc access without
 * a runtime check can reach for {@link useClient} directly and supply their own type narrowing.
 *
 * @typeParam TClient - The narrowed client shape returned once the capability assertion passes.
 *   Always pass this generic — the hook can't infer it from a string.
 *
 * @example
 * ```ts
 * import { ClientWithRpc, GetEpochInfoApi } from '@solana/kit';
 * import { useClientCapability } from '@solana/react';
 *
 * function useRpc() {
 *     return useClientCapability<ClientWithRpc<GetEpochInfoApi>>({
 *         capability: 'rpc',
 *         hookName: 'useRpc',
 *         providerHint: 'Install `solanaRpc()` on the client.',
 *     });
 * }
 * ```
 *
 * @see {@link useClient}
 * @see {@link ClientProvider}
 */
export function useClientCapability<TClient extends object>({
    capability,
    hookName,
    providerHint,
}: UseClientCapabilityConfig): Client<TClient> {
    const client = useClient<TClient>();
    const required = typeof capability === 'string' ? [capability] : capability;
    const missing = required.filter(name => !Object.hasOwn(client, name));
    if (missing.length > 0) {
        throw new SolanaError(SOLANA_ERROR__REACT__MISSING_CAPABILITY, {
            capabilities: missing,
            hookName,
            providerHint,
        });
    }
    return client;
}
