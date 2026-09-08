/* eslint-disable react-hooks/rules-of-hooks */

import type { ReactiveStreamSource } from '@solana/kit';
import type { UseQueryResult } from '@tanstack/react-query';

import { useSubscriptionQuery } from '../useSubscriptionQuery';

type Notification = { context: { slot: bigint }; value: { lamports: bigint } };

const fnSource = null as unknown as (signal: AbortSignal) => AsyncIterable<Notification>;
const reactiveSource = null as unknown as ReactiveStreamSource<Notification>;

// [DESCRIBE] useSubscriptionQuery
{
    // Function (AsyncIterable) source — returns UseQueryResult with the notification type.
    {
        useSubscriptionQuery(['slot'], fnSource) satisfies UseQueryResult<Notification>;
    }

    // ReactiveStreamSource — returns UseQueryResult with the source's notification type.
    {
        useSubscriptionQuery(['account'], reactiveSource) satisfies UseQueryResult<Notification>;
    }

    // `data` is the raw notification (envelope NOT unwrapped) and is `T | undefined` until the first
    // notification arrives.
    {
        const { data } = useSubscriptionQuery(['account'], reactiveSource);
        data satisfies Notification | undefined;
        // @ts-expect-error - `data` is the raw notification, not the unwrapped `value`.
        data satisfies { lamports: bigint } | undefined;
    }

    // Null source is accepted (disables the query, mapping to TanStack's `enabled: false`). Explicit
    // `T` is required — there's no source value for inference to pick `T` up from.
    {
        useSubscriptionQuery<Notification>(['account'], null) satisfies UseQueryResult<Notification, unknown>;
    }

    // Default error type is unknown; TanStack surfaces `TError | null`.
    {
        const { error } = useSubscriptionQuery(['slot'], fnSource);
        error satisfies unknown;
        // @ts-expect-error - errors default to unknown, not Error.
        error satisfies Error | null;
    }

    // `TError` is overridable via the generic.
    {
        useSubscriptionQuery<Notification, string>(['slot'], fnSource).error satisfies string | null;
    }

    // `select` transforms `data`, and `TData` is inferred from its return type.
    {
        const { data } = useSubscriptionQuery(['account'], reactiveSource, {
            select: ({ value }) => value.lamports,
        });
        data satisfies bigint | undefined;
        // @ts-expect-error - after `select`, `data` is the projected type, not the source type.
        data satisfies Notification | undefined;
    }

    // `select`'s input is the source's notification type.
    {
        useSubscriptionQuery(['account'], reactiveSource, {
            select: data => {
                data satisfies Notification;
                return data.value.lamports;
            },
        });
    }

    // `TData` is overridable via the third generic (e.g. for a null source where there's nothing to
    // infer `select`'s input from).
    {
        useSubscriptionQuery<Notification, unknown, bigint>(['account'], null, {
            select: ({ value }) => value.lamports,
        }).data satisfies bigint | undefined;
    }

    // Options are forwarded to TanStack's configuration.
    {
        useSubscriptionQuery(['slot'], fnSource, {
            enabled: false,
            // @ts-expect-error - TanStack doesn't accept arbitrary keys.
            notARealOption: true,
        });
    }

    // `queryKey` and `queryFn` are owned by the hook and cannot be overridden via options.
    {
        useSubscriptionQuery(['slot'], fnSource, {
            // @ts-expect-error - the hook owns queryFn.
            queryFn: () => Promise.resolve({} as Notification),
        });
    }

    // Kit-specific options merge into the TanStack options bag.
    {
        useSubscriptionQuery(['slot'], fnSource, {
            enabled: true,
            getAbortSignal: () => AbortSignal.timeout(30_000),
        });
    }

    // `getAbortSignal` must return an AbortSignal (or undefined when omitted).
    {
        useSubscriptionQuery(['slot'], fnSource, {
            // @ts-expect-error - factory must return AbortSignal.
            getAbortSignal: () => 'not a signal',
        });
    }

    // Function source must return `AsyncIterable<T>` and accept an AbortSignal.
    {
        useSubscriptionQuery(['slot'], (signal: AbortSignal) => {
            signal satisfies AbortSignal;
            return null as unknown as AsyncIterable<Notification>;
        });
    }

    // A function source returning a non-iterable is rejected.
    {
        // @ts-expect-error - must return an AsyncIterable, not a bare value.
        useSubscriptionQuery(['slot'], (_signal: AbortSignal) => ({ lamports: 1n }));
    }
}
