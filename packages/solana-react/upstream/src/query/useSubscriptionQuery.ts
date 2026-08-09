import type { ReactiveStreamSource } from '@solana/kit';
import {
    experimental_streamedQuery,
    type QueryFunction,
    type QueryFunctionContext,
    type QueryKey,
    useQuery,
    type UseQueryOptions,
    type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback } from 'react';

import { useLatest } from '../useLatest';
import type { UseRequestOptions } from '../useRequest';
import { bridgeStoreToAsyncIterable } from './bridgeStoreToAsyncIterable';

/**
 * Options accepted by {@link useSubscriptionQuery}: every option `@tanstack/react-query`'s `useQuery`
 * takes (minus `queryKey` and `queryFn`, which this hook owns) plus the Kit-specific
 * {@link UseRequestOptions}.
 *
 * @typeParam T - The notification type emitted by the source.
 * @typeParam TError - The error type TanStack Query will surface on failure.
 * @typeParam TData - The shape of `data` after any `select` transform. Defaults to `T` when no
 * `select` is supplied.
 */
export type UseSubscriptionQueryOptions<T, TError = unknown, TData = T> = Omit<
    UseQueryOptions<T, TError, TData, QueryKey>,
    'queryFn' | 'queryKey'
> &
    UseRequestOptions;

/**
 * TanStack Query-backed counterpart to core's `useSubscription`, for streams that have no one-shot
 * RPC fetch counterpart. Routes a long-lived stream through TanStack Query's cache via
 * `experimental_streamedQuery`, so components reading the same `key` share one underlying connection
 * and the stream participates in TanStack Query's cache and devtools.
 *
 * The source has the same two shapes as {@link useRequestQuery}, the pull-based analog of its
 * `(signal) => Promise<T>` arm: a {@link ReactiveStreamSource} (satisfied by an RPC subscription) or
 * a raw `(signal: AbortSignal) => AsyncIterable<T>` factory. `streamedQuery` is itself built on
 * `AsyncIterable`, so the factory's iterable is consumed directly; a `ReactiveStreamSource` is
 * adapted to one internally. The factory receives TanStack's query-cancellation signal (combined
 * with any `getAbortSignal` you supply) so a `fetch`- or socket-backed generator can bind
 * cancellation to it.
 *
 * `data` is the raw notification, exactly as the source emits it. For RPC subscriptions read
 * `data.value` and `data.context.slot` yourself.
 *
 * Because the stream never settles, the query stays in `fetchStatus: 'fetching'` for the
 * subscription's whole life — `isFetching` is permanently `true` and `isLoading` flips false
 * after the first notification. Read `data` / `error` / `status` and ignore `isFetching` for
 * subscriptions. `result.refetch()` reconnects: TanStack aborts the old signal (ending the prior
 * iterable, which resets its store) and opens a fresh stream. Fire and forget — for a never-ending
 * stream the returned promise never resolves, so don't `await refetch()` (a click handler that does
 * will hang forever).
 *
 * Defaults, all overridable: `retry: false` (the underlying reactive store owns retry/backoff),
 * `staleTime: Infinity` and `refetchOnWindowFocus: false` (a focus revalidation must not tear down
 * and re-open the socket — the subscription is what keeps data fresh). The internal `refetchMode` is
 * `'append'` paired with a replace-latest reducer: every notification is written to the cache live,
 * and the prior value stays visible across a reconnect (stale-while-revalidate).
 *
 * Pass `null` for `source` to disable — maps to TanStack's `enabled: false` and combines with any
 * `enabled` you pass (the query runs only when the source is non-null *and* your `enabled` is not
 * `false`).
 *
 * @typeParam T - The notification type emitted by the source.
 * @typeParam TError - The error type TanStack Query will surface on failure.
 * @typeParam TData - The shape of `data` after any `select` transform. Defaults to `T` when no
 * `select` is supplied; pass a `select: (data: T) => TData` option to project each notification into
 * a different shape and `result.data` narrows accordingly.
 *
 * @example
 * ```tsx
 * function SlotHeight() {
 *     const client = useClient<ClientWithRpcSubscriptions<SlotNotificationsApi>>();
 *     const { data, error } = useSubscriptionQuery(['slot'], client.rpcSubscriptions.slotNotifications());
 *     if (error) return <p>Disconnected.</p>;
 *     if (!data) return <p>Connecting…</p>;
 *     return <p>Slot {String(data.slot)}</p>;
 * }
 *
 * // Function shape — wraps an arbitrary async iterable, threading the cancellation signal in.
 * function Ticker() {
 *     const { data } = useSubscriptionQuery(['ticker'], (signal: AbortSignal) => streamPrices(signal));
 *     return <p>{data ?? '…'}</p>;
 * }
 * ```
 *
 * @see {@link UseSubscriptionQueryOptions}
 * @see {@link useRequestQuery}
 */
export function useSubscriptionQuery<T, TError = unknown, TData = T>(
    key: QueryKey,
    source: ReactiveStreamSource<T> | ((signal: AbortSignal) => AsyncIterable<T>) | null,
    options?: UseSubscriptionQueryOptions<T, TError, TData>,
): UseQueryResult<TData, TError> {
    // Split our option off the TanStack config so we can hand the rest to `useQuery` cleanly.
    const { getAbortSignal, ...queryOptions } = options ?? {};

    // Ref-sync the source and the abort-signal factory so an inline value passed each render doesn't
    // change the streamFn's identity. The streamFn reads the latest values from the refs when it
    // fires; TanStack uses the key (not the queryFn identity) for cache lookup.
    const sourceRef = useLatest(source);
    const getAbortSignalRef = useLatest(getAbortSignal);

    const queryFn = useCallback<QueryFunction<T, QueryKey>>(
        context =>
            // `streamedQuery`'s generics default to array accumulation (`TData = Array<TQueryFnData>`).
            // The explicit `<T, T>` plus a replace-latest reducer types the cache value as the latest
            // scalar notification rather than `T[]`. `initialValue` only seeds the (ignored) reducer
            // accumulator before the first chunk, so its value is irrelevant — only its type matters.
            experimental_streamedQuery<T, T>({
                initialValue: undefined as T,
                reducer: (_previous, chunk) => chunk,
                // `'append'` is the only mode that writes every chunk to the cache live while leaving
                // the prior value in place across a refetch. `'reset'` would flash to pending on each
                // reconnect; `'replace'` only flushes once at stream end — which for a never-ending
                // subscription never happens (an abort skips the final write), freezing the value.
                refetchMode: 'append',
                streamFn: ({ signal }: QueryFunctionContext) => {
                    const current = sourceRef.current;
                    if (current == null) {
                        // Defensive: a null source forces `enabled: false` below, so TanStack won't
                        // schedule this queryFn. This branch should be unreachable.
                        throw new Error('useSubscriptionQuery: the streamFn ran with a null source');
                    }
                    const userSignal = getAbortSignalRef.current?.();
                    // `signal` is TanStack's query-cancellation signal. Combine it with the caller's
                    // signal (when present) so aborting either tears the stream down.
                    const combinedSignal = userSignal ? AbortSignal.any([signal, userSignal]) : signal;
                    if (typeof current === 'function') {
                        return current(combinedSignal);
                    }
                    return bridgeStoreToAsyncIterable(current.reactiveStore(), combinedSignal);
                },
            })(context),
        [getAbortSignalRef, sourceRef],
    );

    return useQuery<T, TError, TData, QueryKey>({
        // Sensible defaults for a long-lived stream; all overridable by `queryOptions` below.
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: Infinity,
        ...queryOptions,
        // A null source disables the query (TanStack's `enabled: false`). Combine with the caller's
        // own `enabled` so the query runs only when the source is present *and* not disabled.
        enabled: source != null && (queryOptions.enabled ?? true),
        queryFn,
        queryKey: key,
    });
}
