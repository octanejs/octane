import type { ReactiveActionSource } from '@solana/kit';
import { useCallback } from 'react';
import useSWR, { type Key as SWRKey, type SWRConfiguration, type SWRResponse } from 'swr';

import { useLatest } from '../useLatest';
import type { UseRequestOptions } from '../useRequest';

let neverAbortedSignal: AbortSignal | undefined;

function getNeverAbortedSignal(): AbortSignal {
    // Reused for function sources when no `getAbortSignal` factory is configured. The function's
    // signature requires an `AbortSignal`; this one is intentionally never aborted (it is NOT wired
    // to component unmount or SWR supersession because SWR discards stale results instead).
    return (neverAbortedSignal ||= new AbortController().signal);
}

/**
 * SWR-backed counterpart to core's `useRequest`. Accepts the same source shape — a
 * {@link ReactiveActionSource} (satisfied by `PendingRpcRequest<T>`) or a
 * `(signal: AbortSignal) => Promise<T>` function — and routes it through SWR's cache.
 *
 * Pass `null` for `key` or `source` to disable — useful when one of the source's inputs isn't
 * yet known. Use `result.mutate()` to refresh.
 *
 * @typeParam T - The value the underlying request resolves to.
 * @typeParam TError - The error type SWR will surface on failure.
 *
 * @example
 * ```tsx
 * function LatestBlockhash() {
 *     const client = useClient<ClientWithRpc<GetLatestBlockhashApi>>();
 *     const { data, error, isLoading, mutate } = useRequestSWR(
 *         ['latestBlockhash'],
 *         client.rpc.getLatestBlockhash(),
 *         { getAbortSignal: () => AbortSignal.timeout(5_000) },
 *     );
 *     if (error) return <button onClick={() => mutate()}>Retry</button>;
 *     if (isLoading) return <p>Loading…</p>;
 *     return <p>Blockhash: {data!.value.blockhash}</p>;
 * }
 *
 * // Function shape — wraps an arbitrary async call.
 * function Profile({ userId }: { userId: string }) {
 *     const { data, error, isLoading, mutate } = useRequestSWR(
 *         ['users', userId],
 *         (signal: AbortSignal) => fetch(`/api/users/${userId}`, { signal }).then(r => r.json()),
 *     );
 *     if (error) return <button onClick={() => mutate()}>Retry</button>;
 *     if (isLoading) return <p>Loading…</p>;
 *     return <p>{data!.name}</p>;
 * }
 * ```
 */
export function useRequestSWR<T, TError = unknown>(
    key: SWRKey,
    source: ReactiveActionSource<T> | ((signal: AbortSignal) => Promise<T>) | null,
    options?: SWRConfiguration<T, TError> & UseRequestOptions,
): SWRResponse<T, TError> {
    // Split our option off the SWR config so we can hand the rest to `useSWR` cleanly.
    const { getAbortSignal, ...swrConfig } = options ?? {};

    // Ref-sync the source and the abort-signal factory so an inline closure passed each render
    // doesn't change the fetcher's identity. The fetcher reads the latest values from the refs
    // when it fires; SWR uses the key (not the fetcher identity) for cache lookup.
    const sourceRef = useLatest(source);
    const getAbortSignalRef = useLatest(getAbortSignal);

    const fetcher = useCallback(async (): Promise<T> => {
        const userSignal = getAbortSignalRef.current?.();
        const current = sourceRef.current;
        if (current == null) {
            // The source was nulled out between SWR firing this fetch and the body running.
            // SWR will settle into the disabled state on the next render; bail with `undefined`
            // (matches SWR's `data` shape while loading) so we don't synthesize a spurious error.
            return undefined as T;
        }
        if (typeof current === 'function') {
            return await current(userSignal ?? getNeverAbortedSignal());
        }
        if (userSignal) {
            return await current.reactiveStore().withSignal(userSignal).dispatchAsync();
        }
        return await current.reactiveStore().dispatchAsync();
        // `sourceRef` and `getAbortSignalRef` are stable refs from `useLatest`, so listing them
        // leaves `fetcher` referentially stable across renders — SWR keys off `key`, not the
        // fetcher identity, but a stable fetcher avoids needless re-subscription churn.
    }, [getAbortSignalRef, sourceRef]);

    // When `source` is null, force the SWR key to null so the fetch is disabled regardless of
    // whether the caller passed a non-null key.
    return useSWR<T, TError>(source == null ? null : key, fetcher, swrConfig);
}
