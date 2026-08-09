import {
    createClient,
    isSolanaError,
    SOLANA_ERROR__REACT__MISSING_CAPABILITY,
    SOLANA_ERROR__REACT__MISSING_PROVIDER,
} from '@solana/kit';
import React from 'react';

import { renderHook } from '../__test-utils__/render';
import { ClientProvider } from '../ClientProvider';
import { useClient } from '../useClient';
import { useClientCapability } from '../useClientCapability';

type ClientWithFoo = { foo: { hello(): string } };

function wrapperFor<T extends object>(client: ReturnType<typeof createClient<T>>) {
    return ({ children }: { children: React.ReactNode }) => <ClientProvider client={client}>{children}</ClientProvider>;
}

describe('useClientCapability', () => {
    it('returns the client when the capability is present', () => {
        const client = createClient<ClientWithFoo>({ foo: { hello: () => 'world' } });
        const { result } = renderHook(
            () =>
                useClientCapability<ClientWithFoo>({
                    capability: 'foo',
                    hookName: 'useFoo',
                    providerHint: 'Install fooPlugin().',
                }),
            { wrapper: wrapperFor(client) },
        );
        expect(result.current).toBe(client);
    });

    it('throws MISSING_CAPABILITY with hookName + providerHint when the capability is absent', () => {
        const client = createClient(); // no `foo` capability
        const { result } = renderHook(
            () => {
                try {
                    return useClientCapability<ClientWithFoo>({
                        capability: 'foo',
                        hookName: 'useFoo',
                        providerHint: 'Install fooPlugin().',
                    });
                } catch (err) {
                    return err;
                }
            },
            { wrapper: wrapperFor(client) },
        );
        expect(isSolanaError(result.current, SOLANA_ERROR__REACT__MISSING_CAPABILITY)).toBe(true);
        const ctx = (
            result.current as { context: { capabilities: readonly string[]; hookName: string; providerHint: string } }
        ).context;
        expect(ctx.capabilities).toEqual(['foo']);
        expect(ctx.hookName).toBe('useFoo');
        expect(ctx.providerHint).toBe('Install fooPlugin().');
    });

    it('reports only the missing entries when capability is an array', () => {
        const client = createClient<{ rpc: object }>({ rpc: {} }); // missing rpcSubscriptions only
        const { result } = renderHook(
            () => {
                try {
                    return useClientCapability<{ rpc: object; rpcSubscriptions: object }>({
                        capability: ['rpc', 'rpcSubscriptions'],
                        hookName: 'useLiveData',
                        providerHint: 'Install solanaRpcConnection().',
                    });
                } catch (err) {
                    return err;
                }
            },
            { wrapper: wrapperFor(client) },
        );
        expect(isSolanaError(result.current, SOLANA_ERROR__REACT__MISSING_CAPABILITY)).toBe(true);
        expect((result.current as { context: { capabilities: readonly string[] } }).context.capabilities).toEqual([
            'rpcSubscriptions',
        ]);
    });

    it('reports every missing entry when several capabilities are absent', () => {
        const client = createClient<{ rpc: object }>({ rpc: {} }); // missing rpcSubscriptions and wallet
        const { result } = renderHook(
            () => {
                try {
                    return useClientCapability<{ rpc: object; rpcSubscriptions: object; wallet: object }>({
                        capability: ['rpc', 'rpcSubscriptions', 'wallet'],
                        hookName: 'useEverything',
                        providerHint: 'Install the missing plugins.',
                    });
                } catch (err) {
                    return err;
                }
            },
            { wrapper: wrapperFor(client) },
        );
        expect(isSolanaError(result.current, SOLANA_ERROR__REACT__MISSING_CAPABILITY)).toBe(true);
        expect((result.current as { context: { capabilities: readonly string[] } }).context.capabilities).toEqual([
            'rpcSubscriptions',
            'wallet',
        ]);
    });

    it('underlying useClient throws MISSING_PROVIDER outside a provider', () => {
        const { result } = renderHook(() => {
            try {
                return useClient();
            } catch (err) {
                return err;
            }
        });
        expect(isSolanaError(result.current, SOLANA_ERROR__REACT__MISSING_PROVIDER)).toBe(true);
    });
});
