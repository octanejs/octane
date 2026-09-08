/* eslint-disable react-hooks/rules-of-hooks */

import type { ReactiveActionSource } from '@solana/kit';
import type { UseQueryResult } from '@tanstack/react-query';

import { useRequestQuery } from '../useRequestQuery';

const fnSource = null as unknown as (signal: AbortSignal) => Promise<{ slot: bigint }>;
const reactiveSource = null as unknown as ReactiveActionSource<{ slot: bigint }>;

// [DESCRIBE] useRequestQuery
{
    // Function source — returns UseQueryResult with the resolved type.
    {
        useRequestQuery(['epochInfo'], fnSource) satisfies UseQueryResult<{ slot: bigint }>;
    }

    // ReactiveActionSource — returns UseQueryResult with the source's value type.
    {
        useRequestQuery(['balance'], reactiveSource) satisfies UseQueryResult<{ slot: bigint }>;
    }

    // `data` is `T | undefined` until the first successful fetch.
    {
        const { data } = useRequestQuery(['epochInfo'], fnSource);
        data satisfies { slot: bigint } | undefined;
    }

    // Null source is accepted (disables the query, mapping to TanStack's `enabled: false`).
    // Explicit `T` is required here — there's no source value for inference to pick `T` up from.
    // `TError` defaults to `unknown` (not TanStack's `Error`), matching the rest of the family.
    {
        useRequestQuery<{ slot: bigint }>(['epochInfo'], null) satisfies UseQueryResult<{ slot: bigint }, unknown>;
    }

    // Default error type is unknown; TanStack surfaces `TError | null`.
    {
        const { error } = useRequestQuery(['epochInfo'], fnSource);
        error satisfies unknown;
        // @ts-expect-error - errors default to unknown, not Error.
        error satisfies Error | null;
    }

    // `TError` is overridable via the generic.
    {
        useRequestQuery<{ slot: bigint }, string>(['epochInfo'], fnSource).error satisfies string | null;
    }

    // `select` transforms `data`, and `TData` is inferred from its return type.
    {
        const { data } = useRequestQuery(['epochInfo'], fnSource, {
            select: ({ slot }) => slot,
        });
        data satisfies bigint | undefined;
        // @ts-expect-error - after `select`, `data` is the projected type, not the source type.
        data satisfies { slot: bigint } | undefined;
    }

    // `select`'s input is the source's resolved value type.
    {
        useRequestQuery(['epochInfo'], fnSource, {
            select: data => {
                data satisfies { slot: bigint };
                return data.slot;
            },
        });
    }

    // `TData` is overridable via the third generic (e.g. for a null source where there's nothing to
    // infer `select`'s input from).
    {
        useRequestQuery<{ slot: bigint }, unknown, bigint>(['epochInfo'], null, {
            select: ({ slot }) => slot,
        }).data satisfies bigint | undefined;
    }

    // Options are forwarded to TanStack's configuration.
    {
        useRequestQuery(['epochInfo'], fnSource, {
            enabled: false,
            // @ts-expect-error - TanStack doesn't accept arbitrary keys.
            notARealOption: true,
        });
    }

    // `queryKey` and `queryFn` are owned by the hook and cannot be overridden via options.
    {
        useRequestQuery(['epochInfo'], fnSource, {
            // @ts-expect-error - the hook owns queryFn.
            queryFn: () => Promise.resolve({ slot: 1n }),
        });
    }

    // Kit-specific options merge into the TanStack options bag.
    {
        useRequestQuery(['epochInfo'], fnSource, {
            enabled: true,
            getAbortSignal: () => AbortSignal.timeout(5_000),
        });
    }

    // `getAbortSignal` must return an AbortSignal (or undefined when omitted).
    {
        useRequestQuery(['epochInfo'], fnSource, {
            // @ts-expect-error - factory must return AbortSignal.
            getAbortSignal: () => 'not a signal',
        });
    }

    // Function source must return `Promise<T>` and accept an AbortSignal.
    {
        useRequestQuery(['epochInfo'], (signal: AbortSignal) => {
            signal satisfies AbortSignal;
            return Promise.resolve({ slot: 1n });
        });
    }
}
