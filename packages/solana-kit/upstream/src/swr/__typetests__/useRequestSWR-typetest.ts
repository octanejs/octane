/* eslint-disable react-hooks/rules-of-hooks */

import type { ReactiveActionSource } from '@solana/kit';
import type { SWRResponse } from 'swr';

import { useRequestSWR } from '../useRequestSWR';

const fnSource = null as unknown as (signal: AbortSignal) => Promise<{ slot: bigint }>;
const reactiveSource = null as unknown as ReactiveActionSource<{ slot: bigint }>;

// [DESCRIBE] useRequestSWR
{
    // Function source — returns SWRResponse with the resolved type.
    {
        useRequestSWR(['epochInfo'], fnSource) satisfies SWRResponse<{ slot: bigint }>;
    }

    // ReactiveActionSource — returns SWRResponse with the source's value type.
    {
        useRequestSWR(['balance'], reactiveSource) satisfies SWRResponse<{ slot: bigint }>;
    }

    // `data` is `T | undefined` until the first successful fetch.
    {
        const { data } = useRequestSWR(['epochInfo'], fnSource);
        data satisfies { slot: bigint } | undefined;
    }

    // Null key is accepted (disables the fetch).
    {
        useRequestSWR(null, fnSource) satisfies SWRResponse<{ slot: bigint }>;
    }

    // Null source is accepted (also disables the fetch). Explicit `T` is required here — there's
    // no source value for inference to pick `T` up from.
    {
        useRequestSWR<{ slot: bigint }>(['epochInfo'], null) satisfies SWRResponse<{ slot: bigint }>;
    }

    // Default error type is unknown.
    {
        const { error } = useRequestSWR(['epochInfo'], fnSource);
        error satisfies unknown;
        // @ts-expect-error - errors default to unknown, not Error.
        error satisfies Error | undefined;
    }

    // `TError` is overridable via the generic.
    {
        useRequestSWR<{ slot: bigint }, string>(['epochInfo'], fnSource).error satisfies string | undefined;
    }

    // Options are forwarded to SWR's configuration.
    {
        useRequestSWR(['epochInfo'], fnSource, {
            // @ts-expect-error - SWR doesn't accept arbitrary keys.
            notARealOption: true,
            revalidateOnFocus: false,
        });
    }

    // Kit-specific options merge into the SWR options bag.
    {
        useRequestSWR(['epochInfo'], fnSource, {
            getAbortSignal: () => AbortSignal.timeout(5_000),
            revalidateOnFocus: false,
        });
    }

    // `getAbortSignal` must return an AbortSignal (or undefined when omitted).
    {
        useRequestSWR(['epochInfo'], fnSource, {
            // @ts-expect-error - factory must return AbortSignal.
            getAbortSignal: () => 'not a signal',
        });
    }

    // Function source must return `Promise<T>` and accept an AbortSignal.
    {
        useRequestSWR(['epochInfo'], (signal: AbortSignal) => {
            signal satisfies AbortSignal;
            return Promise.resolve({ slot: 1n });
        });
    }
}
