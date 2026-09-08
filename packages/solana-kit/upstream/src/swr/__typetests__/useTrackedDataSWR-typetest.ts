/* eslint-disable react-hooks/rules-of-hooks */

import type { SolanaRpcResponse } from '@solana/kit';
import type { SWRSubscriptionResponse } from 'swr/subscription';

import type { TrackedDataSpec } from '../../useTrackedData';
import { useTrackedDataSWR } from '../useTrackedDataSWR';

const spec = null as unknown as TrackedDataSpec<{ a: number }, { b: number }, number>;

// [DESCRIBE] useTrackedDataSWR
{
    // `data` is the underlying primitive's guaranteed `SolanaRpcResponse<TItem>` envelope. Callers
    // read data.value and data.context.slot directly.
    {
        const result = useTrackedDataSWR(['balance'], spec);
        result.data satisfies SolanaRpcResponse<number> | undefined;
        result.data?.value satisfies number | undefined;
        result.data?.context.slot satisfies bigint | undefined;
    }

    // Null key disables.
    {
        useTrackedDataSWR(null, spec) satisfies SWRSubscriptionResponse<SolanaRpcResponse<number>, unknown>;
    }

    // Null spec disables.
    {
        useTrackedDataSWR<{ a: number }, { b: number }, number>(['balance'], null) satisfies SWRSubscriptionResponse<
            SolanaRpcResponse<number>,
            unknown
        >;
    }

    // Default error type is unknown.
    {
        const { error } = useTrackedDataSWR(['balance'], spec);
        error satisfies unknown;
        // @ts-expect-error - errors default to unknown, not Error.
        error satisfies Error | undefined;
    }

    // TError is overridable via the generic.
    {
        useTrackedDataSWR<{ a: number }, { b: number }, number, string>(['balance'], spec).error satisfies
            | string
            | undefined;
    }

    // Options are forwarded to SWR's configuration and typed against the envelope data.
    {
        useTrackedDataSWR(['balance'], spec, {
            fallbackData: { context: { slot: 1n }, value: 1 },
            // @ts-expect-error - SWR doesn't accept arbitrary keys.
            notARealOption: true,
            onSuccess(data) {
                data.value satisfies number;
                data.context.slot satisfies bigint;
            },
            revalidateOnFocus: false,
        });
        useTrackedDataSWR(['balance'], spec, {
            // @ts-expect-error - fallback data must match the envelope shape.
            fallbackData: { nope: 1 },
        });
    }

    // This hook does not accept a getAbortSignal option (lifetime is controlled via the key).
    {
        useTrackedDataSWR(['balance'], spec, {
            // @ts-expect-error - getAbortSignal is not part of the SWR adapter's options.
            getAbortSignal: () => AbortSignal.timeout(30_000),
        });
    }
}
