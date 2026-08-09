/* eslint-disable react-hooks/rules-of-hooks */

import type { SolanaRpcResponse } from '@solana/kit';
import type { UseQueryResult } from '@tanstack/react-query';

import type { TrackedDataSpec } from '../../useTrackedData';
import { useTrackedDataQuery } from '../useTrackedDataQuery';

const spec = null as unknown as TrackedDataSpec<{ a: number }, { b: number }, number>;

// [DESCRIBE] useTrackedDataQuery
{
    // `data` is the underlying primitive's guaranteed `SolanaRpcResponse<TItem>` envelope. Callers
    // read data.value and data.context.slot directly, and it is `undefined` until the first value.
    {
        const result = useTrackedDataQuery(['balance'], spec);
        result satisfies UseQueryResult<SolanaRpcResponse<number>, unknown>;
        result.data satisfies SolanaRpcResponse<number> | undefined;
        result.data?.value satisfies number | undefined;
        result.data?.context.slot satisfies bigint | undefined;
    }

    // Null spec is accepted (disables the query, mapping to TanStack's `enabled: false`). Explicit
    // generics are required — there's no spec value for inference to pick them up from.
    {
        useTrackedDataQuery<{ a: number }, { b: number }, number>(['balance'], null) satisfies UseQueryResult<
            SolanaRpcResponse<number>,
            unknown
        >;
    }

    // Default error type is unknown; TanStack surfaces `TError | null`.
    {
        const { error } = useTrackedDataQuery(['balance'], spec);
        error satisfies unknown;
        // @ts-expect-error - errors default to unknown, not Error.
        error satisfies Error | null;
    }

    // `TError` is overridable via the generic.
    {
        useTrackedDataQuery<{ a: number }, { b: number }, number, string>(['balance'], spec).error satisfies
            | string
            | null;
    }

    // `select` transforms `data`, and `TData` is inferred from its return type.
    {
        const { data } = useTrackedDataQuery(['balance'], spec, {
            select: envelope => envelope.value,
        });
        data satisfies number | undefined;
        // @ts-expect-error - after `select`, `data` is the projected type, not the envelope.
        data satisfies SolanaRpcResponse<number> | undefined;
    }

    // `select`'s input is the `SolanaRpcResponse<TItem>` envelope.
    {
        useTrackedDataQuery(['balance'], spec, {
            select: data => {
                data satisfies SolanaRpcResponse<number>;
                return data.value;
            },
        });
    }

    // `TData` is overridable via the fifth generic (e.g. for a null spec where there's nothing to
    // infer `select`'s input from).
    {
        useTrackedDataQuery<{ a: number }, { b: number }, number, unknown, bigint>(['balance'], null, {
            select: ({ context }) => context.slot,
        }).data satisfies bigint | undefined;
    }

    // Options are forwarded to TanStack's configuration.
    {
        useTrackedDataQuery(['balance'], spec, {
            enabled: false,
            // @ts-expect-error - TanStack doesn't accept arbitrary keys.
            notARealOption: true,
        });
    }

    // `queryKey` and `queryFn` are owned by the hook and cannot be overridden via options.
    {
        useTrackedDataQuery(['balance'], spec, {
            // @ts-expect-error - the hook owns queryFn.
            queryFn: () => Promise.resolve({} as SolanaRpcResponse<number>),
        });
    }

    // Kit-specific `getAbortSignal` merges into the TanStack options bag.
    {
        useTrackedDataQuery(['balance'], spec, {
            enabled: true,
            getAbortSignal: () => AbortSignal.timeout(30_000),
        });
    }

    // `getAbortSignal` must return an AbortSignal (or undefined when omitted).
    {
        useTrackedDataQuery(['balance'], spec, {
            // @ts-expect-error - factory must return AbortSignal.
            getAbortSignal: () => 'not a signal',
        });
    }
}
