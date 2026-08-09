import type { ReactiveActionSource } from '@solana/kit';
import {
    type QueryFunctionContext,
    type QueryKey,
    useQuery,
    type UseQueryOptions,
    type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback } from 'react';

import { useLatest } from '../useLatest';
import type { UseRequestOptions } from '../useRequest';

/**
 * Options accepted by {@link useRequestQuery}: every option `@tanstack/react-query`'s `useQuery`
 * takes (minus `queryKey` and `queryFn`, which this hook owns) plus the Kit-specific
 * {@link UseRequestOptions}.
 *
 * @typeParam T - The value the underlying request resolves to.
 * @typeParam TError - The error type TanStack Query will surface on failure.
 * @typeParam TData - The shape of `data` after any `select` transform. Defaults to `T` when no
 * `select` is supplied.
 */
export type UseRequestQueryOptions<T, TError = unknown, TData = T> = Omit<
    UseQueryOptions<T, TError, TData, QueryKey>,
    'queryFn' | 'queryKey'
> &
    UseRequestOptions;

/**
 * TanStack Query-backed counterpart to core's `useRequest`. Accepts the same source shape — a
 * {@link ReactiveActionSource} (satisfied by `PendingRpcRequest<T>`) or a
 * `(signal: AbortSignal) => Promise<T>` function — and routes it through TanStack Query's cache, so
 * components reading the same `key` dedupe into one in-flight request and the result becomes
 * Suspense-capable and visible in TanStack Query's devtools.
 *
 * The query's `queryFn` is handed TanStack Query's own `AbortSignal`, which aborts when the query
 * is cancelled (unmount, garbage collection, or a superseding refetch). That signal is threaded
 * into the source so cancellation propagates all the way down. When a `getAbortSignal` factory is
 * also supplied (e.g. for a per-attempt timeout), the two signals are combined via
 * {@link AbortSignal.any} — aborting either one cancels the attempt.
 *
 * Pass `null` for `source` to disable — useful when one of the source's inputs isn't yet known.
 * This maps to TanStack's `enabled: false` and combines with any `enabled` you pass yourself (the
 * query runs only when the source is non-null *and* your `enabled` is not `false`). Use
 * `result.refetch()` to refresh.
 *
 * @typeParam T - The value the underlying request resolves to.
 * @typeParam TError - The error type TanStack Query will surface on failure.
 * @typeParam TData - The shape of `data` after any `select` transform. Defaults to `T` when no
 * `select` is supplied; pass a `select: (data: T) => TData` option to project the cached value into
 * a different shape and `result.data` narrows accordingly.
 *
 * @example
 * ```tsx
 * function LatestBlockhash() {
 *     const client = useClient<ClientWithRpc<GetLatestBlockhashApi>>();
 *     const { data, error, isLoading, refetch } = useRequestQuery(
 *         ['latestBlockhash'],
 *         client.rpc.getLatestBlockhash(),
 *         { getAbortSignal: () => AbortSignal.timeout(5_000) },
 *     );
 *     if (error) return <button onClick={() => refetch()}>Retry</button>;
 *     if (isLoading) return <p>Loading…</p>;
 *     return <p>Blockhash: {data!.value.blockhash}</p>;
 * }
 *
 * // Function shape — wraps an arbitrary async call. The source can be an inline closure recreated
 * // each render; the hook reads the latest one when the query fires and keys the cache off `key`,
 * // so there's no need to memoize it.
 * function Profile({ userId }: { userId: string }) {
 *     const { data, error, isLoading, refetch } = useRequestQuery(
 *         ['users', userId],
 *         (signal: AbortSignal) => fetch(`/api/users/${userId}`, { signal }).then(r => r.json()),
 *     );
 *     if (error) return <button onClick={() => refetch()}>Retry</button>;
 *     if (isLoading) return <p>Loading…</p>;
 *     return <p>{data!.name}</p>;
 * }
 * ```
 *
 * @see {@link UseRequestQueryOptions}
 */
export function useRequestQuery<T, TError = unknown, TData = T>(
    key: QueryKey,
    source: ReactiveActionSource<T> | ((signal: AbortSignal) => Promise<T>) | null,
    options?: UseRequestQueryOptions<T, TError, TData>,
): UseQueryResult<TData, TError> {
    // Split our option off the TanStack config so we can hand the rest to `useQuery` cleanly.
    const { getAbortSignal, ...queryOptions } = options ?? {};

    // Ref-sync the source and the abort-signal factory so an inline closure passed each render
    // doesn't change the queryFn's identity. The queryFn reads the latest values from the refs when
    // it fires; TanStack uses the key (not the queryFn identity) for cache lookup.
    const sourceRef = useLatest(source);
    const getAbortSignalRef = useLatest(getAbortSignal);

    const queryFn = useCallback(
        async ({ signal }: QueryFunctionContext): Promise<T> => {
            const current = sourceRef.current;
            if (current == null) {
                // Defensive: a null source forces `enabled: false` below, so TanStack won't schedule
                // this queryFn. This branch should be unreachable.
                throw new Error('useRequestQuery: the queryFn ran with a null source');
            }
            const userSignal = getAbortSignalRef.current?.();
            // `signal` is TanStack's query-cancellation signal. Combine it with the caller's signal
            // (when present) so aborting either cancels the attempt.
            const combinedSignal = userSignal ? AbortSignal.any([signal, userSignal]) : signal;
            if (typeof current === 'function') {
                return await current(combinedSignal);
            }
            return await current.reactiveStore().withSignal(combinedSignal).dispatchAsync();
            // `sourceRef` and `getAbortSignalRef` are stable refs from `useLatest`, so listing them
            // leaves `queryFn` referentially stable across renders — TanStack keys off `key`, not
            // the queryFn identity, but a stable queryFn avoids needless churn.
        },
        [getAbortSignalRef, sourceRef],
    );

    return useQuery<T, TError, TData, QueryKey>({
        ...queryOptions,
        // A null source disables the query (TanStack's `enabled: false`). Combine with the caller's
        // own `enabled` so the query runs only when the source is present *and* the caller hasn't
        // disabled it.
        enabled: source != null && (queryOptions.enabled ?? true),
        queryFn,
        queryKey: key,
    });
}
