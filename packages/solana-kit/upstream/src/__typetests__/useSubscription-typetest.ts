/* eslint-disable react-hooks/rules-of-hooks */

import { ReactiveStreamSource, SolanaRpcResponse } from '@solana/kit';

import { SubscriptionResult, useSubscription } from '../useSubscription';

const accountSource = null as unknown as ReactiveStreamSource<SolanaRpcResponse<{ lamports: bigint }>>;
const slotSource = null as unknown as ReactiveStreamSource<{ slot: bigint }>;

// [DESCRIBE] useSubscription
{
    // Envelope sources surface the envelope as-is — callers read `data.value` and
    // `data.context.slot` directly.
    {
        const account = useSubscription(accountSource);
        account satisfies SubscriptionResult<SolanaRpcResponse<{ lamports: bigint }>>;
        account.data satisfies SolanaRpcResponse<{ lamports: bigint }> | undefined;
        account.data?.value satisfies { lamports: bigint } | undefined;
        account.data?.context.slot satisfies bigint | undefined;
    }

    // Raw notifications pass through unchanged.
    {
        useSubscription(slotSource) satisfies SubscriptionResult<{ slot: bigint }>;
    }

    // Source argument accepts null
    {
        useSubscription<{ slot: bigint }>(null) satisfies SubscriptionResult<{ slot: bigint }>;
    }

    // Options accept a `getAbortSignal` factory
    {
        useSubscription(slotSource, { getAbortSignal: () => AbortSignal.timeout(30_000) });
    }

    // `reconnect` accepts no args (uses the factory), an `{ abortSignal }` override, or
    // `{ abortSignal: undefined }` to opt out of the factory entirely.
    {
        const { reconnect } = useSubscription(slotSource);
        reconnect();
        reconnect({ abortSignal: AbortSignal.timeout(1_000) });
        reconnect({ abortSignal: undefined });
        // @ts-expect-error - abortSignal must be an AbortSignal (or undefined)
        reconnect({ abortSignal: 'nope' });
    }

    // Status is a discriminated string, not a generic string
    {
        const { status } = useSubscription(slotSource);
        status satisfies 'disabled' | 'error' | 'loaded' | 'loading';
        // @ts-expect-error - 'success' is the action-store vocabulary, not stream
        status satisfies 'success';
    }
}
