/* eslint-disable react-hooks/rules-of-hooks */

import type { CreateReactiveStoreWithInitialValueAndSlotTrackingConfig, Slot, SolanaRpcResponse } from '@solana/kit';

import { TrackedDataResult, TrackedDataSpec, useTrackedData } from '../useTrackedData';

const spec = null as unknown as TrackedDataSpec<{ a: number }, { b: number }, number>;

// [DESCRIBE] TrackedDataSpec
{
    // `TrackedDataSpec` is the React-local alias of the Kit primitive's config — same shape.
    {
        null as unknown as TrackedDataSpec<
            { a: number },
            { b: number },
            number
        > satisfies CreateReactiveStoreWithInitialValueAndSlotTrackingConfig<{ a: number }, { b: number }, number>;
        null as unknown as CreateReactiveStoreWithInitialValueAndSlotTrackingConfig<
            { a: number },
            { b: number },
            number
        > satisfies TrackedDataSpec<{ a: number }, { b: number }, number>;
    }
}

// [DESCRIBE] useTrackedData
{
    // Infers `TItem` from the spec's mappers and surfaces `data` as the primitive's guaranteed
    // `SolanaRpcResponse<TItem>` envelope.
    {
        const result = useTrackedData(spec);
        result satisfies TrackedDataResult<number>;
        result.data satisfies SolanaRpcResponse<number> | undefined;
        result.data?.value satisfies number | undefined;
        result.data?.context.slot satisfies Slot | undefined;
    }

    // Spec accepts null (disabled)
    {
        useTrackedData<{ a: number }, { b: number }, number>(null) satisfies TrackedDataResult<number>;
    }

    // Options accept a `getAbortSignal` factory
    {
        useTrackedData(spec, { getAbortSignal: () => AbortSignal.timeout(30_000) });
    }

    // `refresh` accepts no args (uses factory), an `{ abortSignal }` override, or
    // `{ abortSignal: undefined }` to opt out of the factory entirely.
    {
        const { refresh } = useTrackedData(spec);
        refresh();
        refresh({ abortSignal: AbortSignal.timeout(1_000) });
        refresh({ abortSignal: undefined });
        // @ts-expect-error - abortSignal must be an AbortSignal (or undefined)
        refresh({ abortSignal: 'nope' });
    }

    // Status is a discriminated string literal
    {
        const { status } = useTrackedData(spec);
        status satisfies 'disabled' | 'error' | 'loaded' | 'loading';
        // @ts-expect-error - 'success' is the action-store vocabulary, not stream
        status satisfies 'success';
    }
}
