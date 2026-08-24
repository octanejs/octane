/* eslint-disable react-hooks/rules-of-hooks */

import type { Client } from '@solana/kit';

import { useClientCapability } from '../useClientCapability';

type ClientWithRpc = { rpc: { getEpoch(): bigint } };
type ClientWithRpcAndSubs = ClientWithRpc & { rpcSubscriptions: { slotChanges(): void } };

// [DESCRIBE] useClientCapability
{
    // It narrows the return type via the generic
    {
        const client = useClientCapability<ClientWithRpc>({
            capability: 'rpc',
            hookName: 'useRpc',
            providerHint: 'Install rpcPlugin().',
        });
        client satisfies Client<ClientWithRpc>;
        client.rpc.getEpoch() satisfies bigint;
        // @ts-expect-error - capability not declared in the generic
        void client.rpcSubscriptions;
    }

    // The `capability` config field accepts a single name
    {
        useClientCapability<ClientWithRpc>({
            capability: 'rpc',
            hookName: 'useRpc',
            providerHint: 'Install rpcPlugin().',
        });
    }

    // The `capability` config field accepts an array of names
    {
        useClientCapability<ClientWithRpcAndSubs>({
            capability: ['rpc', 'rpcSubscriptions'],
            hookName: 'useLiveData',
            providerHint: 'Install solanaRpcConnection().',
        });
    }

    // It rejects configs missing required fields
    {
        useClientCapability<ClientWithRpc>(
            // @ts-expect-error - missing hookName + providerHint
            { capability: 'rpc' },
        );
    }
}
