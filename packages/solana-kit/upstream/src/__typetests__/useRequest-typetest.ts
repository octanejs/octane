/* eslint-disable react-hooks/rules-of-hooks */

import { ReactiveActionSource } from '@solana/kit';

import { RequestResult, useRequest } from '../useRequest';

const slotSource = null as unknown as ReactiveActionSource<{ slot: bigint }>;

// [DESCRIBE] useRequest
{
    // Infers T from the source
    {
        useRequest(slotSource) satisfies RequestResult<{ slot: bigint }>;
    }

    // The source argument accepts null
    {
        useRequest<{ slot: bigint }>(null) satisfies RequestResult<{ slot: bigint }>;
    }

    // Options accept a `getAbortSignal` factory
    {
        useRequest(slotSource, { getAbortSignal: () => AbortSignal.timeout(5_000) });
    }

    // `refresh` accepts no args (uses the factory), an `{ abortSignal }` override, or
    // `{ abortSignal: undefined }` to opt out of the factory entirely.
    {
        const { refresh } = useRequest(slotSource);
        refresh();
        refresh({ abortSignal: AbortSignal.timeout(1_000) });
        refresh({ abortSignal: undefined });
        // @ts-expect-error - abortSignal must be an AbortSignal (or undefined)
        refresh({ abortSignal: 'nope' });
    }
}
