/* eslint-disable react-hooks/rules-of-hooks */

import type { ReactiveStreamSource, SolanaRpcResponse } from '@solana/kit';
import type { SWRSubscriptionResponse } from 'swr/subscription';

import { useSubscriptionSWR } from '../useSubscriptionSWR';

const accountSource = null as unknown as ReactiveStreamSource<SolanaRpcResponse<{ lamports: bigint }>>;
const slotSource = null as unknown as ReactiveStreamSource<{ slot: bigint }>;

// [DESCRIBE] useSubscriptionSWR
{
    // Envelope sources surface the envelope unchanged. Callers read data.value and
    // data.context.slot directly.
    {
        const envelope = useSubscriptionSWR(['account'], accountSource);
        envelope.data satisfies SolanaRpcResponse<{ lamports: bigint }> | undefined;
        envelope.data?.value satisfies { lamports: bigint } | undefined;
        envelope.data?.context.slot satisfies bigint | undefined;
    }

    // Raw notifications pass through unchanged.
    {
        const raw = useSubscriptionSWR(['slot'], slotSource);
        raw.data satisfies { slot: bigint } | undefined;
    }

    // Null key disables.
    {
        useSubscriptionSWR(null, slotSource) satisfies SWRSubscriptionResponse<{ slot: bigint }, unknown>;
    }

    // Null source disables.
    {
        useSubscriptionSWR<{ slot: bigint }>(['slot'], null) satisfies SWRSubscriptionResponse<
            { slot: bigint },
            unknown
        >;
    }

    // Default error type is unknown.
    {
        const { error } = useSubscriptionSWR(['slot'], slotSource);
        error satisfies unknown;
        // @ts-expect-error - errors default to unknown, not Error.
        error satisfies Error | undefined;
    }

    // TError is overridable via the generic.
    {
        useSubscriptionSWR<{ slot: bigint }, string>(['slot'], slotSource).error satisfies string | undefined;
    }

    // Options are forwarded to SWR's configuration and typed against the subscription data.
    {
        useSubscriptionSWR(['slot'], slotSource, {
            fallbackData: { slot: 1n },
            // @ts-expect-error - SWR doesn't accept arbitrary keys.
            notARealOption: true,
            onSuccess(data) {
                data.slot satisfies bigint;
            },
            revalidateOnFocus: false,
        });
        useSubscriptionSWR(['slot'], slotSource, {
            // @ts-expect-error - fallback data must match the subscription notification type.
            fallbackData: { nope: 1n },
        });
    }

    // This hook does not accept a getAbortSignal option (lifetime is controlled via the key).
    {
        useSubscriptionSWR(['slot'], slotSource, {
            // @ts-expect-error - getAbortSignal is not part of the SWR adapter's options.
            getAbortSignal: () => AbortSignal.timeout(30_000),
        });
    }
}
