import { createReactiveStoreWithInitialValueAndSlotTracking, type SolanaRpcResponse } from '@solana/kit';
import {
    experimental_streamedQuery,
    type QueryFunction,
    type QueryFunctionContext,
    type QueryKey,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
    type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback } from 'react';

import { useLatest } from '../useLatest';
import type { UseRequestOptions } from '../useRequest';
import type { TrackedDataSpec } from '../useTrackedData';
import { bridgeStoreToAsyncIterable } from './bridgeStoreToAsyncIterable';

/**
 * Options accepted by {@link useTrackedDataQuery}: every option `@tanstack/react-query`'s `useQuery`
 * takes (minus `queryKey` and `queryFn`, which this hook owns) plus the Kit-specific
 * {@link UseRequestOptions}.
 *
 * @typeParam TItem - The unified item type produced by the spec's two mappers, surfaced as
 * `data.value`.
 * @typeParam TError - The error type TanStack Query will surface on failure.
 * @typeParam TData - The shape of `data` after any `select` transform. Defaults to the
 * `SolanaRpcResponse<TItem>` envelope when no `select` is supplied.
 */
export type UseTrackedDataQueryOptions<TItem, TError = unknown, TData = SolanaRpcResponse<TItem>> = Omit<
    UseQueryOptions<SolanaRpcResponse<TItem>, TError, TData, QueryKey>,
    'queryFn' | 'queryKey'
> &
    UseRequestOptions;

/**
 * TanStack Query-backed counterpart to core's `useTrackedData`. Pairs a one-shot RPC fetch with an
 * ongoing subscription (slot-deduped by the underlying Kit primitive) and routes the unified stream
 * through TanStack Query's cache via `experimental_streamedQuery`, so components reading the same
 * `key` share one underlying connection and the stream participates in TanStack Query's cache and
 * devtools.
 *
 * `data` is the `SolanaRpcResponse<TItem>` envelope emitted by the underlying kit primitive — the
 * primitive's type guarantees the envelope shape, so callers can read `data.value` (the unified item
 * produced by the spec's mappers) and `data.context.slot` (the slot the store dedup'd on) directly.
 *
 * Pass a {@link TrackedDataSpec} keyed on whatever inputs it depends on; the hook reads the latest
 * one from a ref, so an inline spec recreated each render is fine (TanStack keys the cache off `key`,
 * not the spec identity — bump the `key` to swap specs). Pass `null` for `spec` to disable — maps to
 * TanStack's `enabled: false` and combines with any `enabled` you pass (the query runs only when the
 * spec is non-null *and* your `enabled` is not `false`).
 *
 * Because the subscription never settles, the query stays in `fetchStatus: 'fetching'` for its whole
 * life — `isFetching` is permanently `true` and `isLoading` flips false after the first value. Read
 * `data` / `error` / `status` and ignore `isFetching`. `result.refetch()` reconnects: TanStack aborts
 * the old signal (ending the prior iterable, which resets its store) and re-runs both the initial RPC
 * fetch and the subscription. Fire and forget — for a never-ending stream the returned promise never
 * resolves, so don't `await refetch()`.
 *
 * Defaults, all overridable: `retry: false` (the underlying reactive store owns retry/backoff),
 * `staleTime: Infinity` and `refetchOnWindowFocus: false` (a focus revalidation must not tear down
 * and re-open the socket — the subscription is what keeps data fresh). The internal `refetchMode` is
 * `'append'` paired with a replace-latest reducer: every value is written to the cache live, and the
 * prior value stays visible across a reconnect (stale-while-revalidate).
 *
 * Slot dedupe spans the TanStack cache, not just one store. The underlying primitive tracks a slot
 * high-water mark per store, but that mark dies when the store is disposed while the cache entry
 * survives. `refetch()` mints a fresh store (high-water reset to -1) while `refetchMode: 'append'`
 * keeps the prior envelope cached, so this hook bridges that gap: the reconnect's fresh store cannot
 * regress the cached envelope to an older slot — e.g. a lagging RPC node resolving the new initial
 * fetch behind the cached value is refused, and the warmer cached value stands until something newer
 * arrives.
 *
 * @typeParam TInitialValue - The value inside the initial RPC `SolanaRpcResponse` envelope.
 * @typeParam TStreamValue - The value inside subscription `SolanaRpcResponse` notifications.
 * @typeParam TItem - The unified item type produced by the two mappers, surfaced as `data.value`.
 * @typeParam TError - The error type TanStack Query will surface on failure.
 * @typeParam TData - The shape of `data` after any `select` transform. Defaults to the
 * `SolanaRpcResponse<TItem>` envelope when no `select` is supplied; pass a
 * `select: (data: SolanaRpcResponse<TItem>) => TData` option to project each value into a different
 * shape and `result.data` narrows accordingly.
 *
 * @example
 * ```tsx
 * function AccountBalance({ address }: { address: Address }) {
 *     const client = useClient<ClientWithRpc<GetBalanceApi> & ClientWithRpcSubscriptions<AccountNotificationsApi>>();
 *     const spec = useMemo(() => ({
 *         initialValueSource: client.rpc.getBalance(address),
 *         initialValueMapper: (lamports: bigint) => lamports,
 *         streamSource: client.rpcSubscriptions.accountNotifications(address),
 *         streamValueMapper: ({ lamports }: { lamports: bigint }) => lamports,
 *     }), [client, address]);
 *     const { data, error } = useTrackedDataQuery(['balance', address], spec);
 *     if (error) return <p>Failed to load.</p>;
 *     return <p>{data ? `${data.value} lamports at slot ${data.context.slot}` : 'Loading…'}</p>;
 * }
 * ```
 *
 * @see {@link UseTrackedDataQueryOptions}
 * @see {@link useSubscriptionQuery}
 */
export function useTrackedDataQuery<
    TInitialValue,
    TStreamValue,
    TItem,
    TError = unknown,
    TData = SolanaRpcResponse<TItem>,
>(
    key: QueryKey,
    spec: TrackedDataSpec<TInitialValue, TStreamValue, TItem> | null,
    options?: UseTrackedDataQueryOptions<TItem, TError, TData>,
): UseQueryResult<TData, TError> {
    // Split our option off the TanStack config so we can hand the rest to `useQuery` cleanly.
    const { getAbortSignal, ...queryOptions } = options ?? {};

    // Ref-sync the spec and the abort-signal factory so an inline value passed each render doesn't
    // change the streamFn's identity. The streamFn reads the latest values from the refs when it
    // fires; TanStack uses the key (not the queryFn identity) for cache lookup.
    const specRef = useLatest(spec);
    const getAbortSignalRef = useLatest(getAbortSignal);

    // The cache outlives the per-attempt store, but the store's slot high-water mark does not — a
    // fresh store (remount, refetch) starts its window at -1. The streamFn reads the currently
    // cached envelope through this client to refuse any value older than what the cache already
    // holds. `useQueryClient` returns a stable reference, so listing it in the deps below is churn-free.
    const queryClient = useQueryClient();

    const queryFn = useCallback<QueryFunction<SolanaRpcResponse<TItem>, QueryKey>>(
        context =>
            // `streamedQuery`'s generics default to array accumulation (`TData = Array<TQueryFnData>`).
            // The explicit `<Envelope, Envelope>` plus a replace-latest reducer types the cache value
            // as the latest scalar envelope rather than an array. `initialValue` only seeds the
            // (ignored) reducer accumulator before the first chunk, so its value is irrelevant — only
            // its type matters.
            experimental_streamedQuery<SolanaRpcResponse<TItem>, SolanaRpcResponse<TItem>>({
                initialValue: undefined as unknown as SolanaRpcResponse<TItem>,
                reducer: (_previous, chunk) => chunk,
                // `'append'` is the only mode that writes every chunk to the cache live while leaving
                // the prior value in place across a refetch. `'reset'` would flash to pending on each
                // reconnect; `'replace'` only flushes once at stream end — which for a never-ending
                // subscription never happens (an abort skips the final write), freezing the value.
                refetchMode: 'append',
                streamFn: ({ queryKey, signal }: QueryFunctionContext) => {
                    const current = specRef.current;
                    if (current == null) {
                        // Defensive: a null spec forces `enabled: false` below, so TanStack won't
                        // schedule this queryFn. This branch should be unreachable.
                        throw new Error('useTrackedDataQuery: the streamFn ran with a null spec');
                    }
                    const userSignal = getAbortSignalRef.current?.();
                    // `signal` is TanStack's query-cancellation signal. Combine it with the caller's
                    // signal (when present) so aborting either tears the stream down.
                    const combinedSignal = userSignal ? AbortSignal.any([signal, userSignal]) : signal;
                    const store = createReactiveStoreWithInitialValueAndSlotTracking(current);
                    // Refuse any envelope older than the slot the cache already holds. A fresh store
                    // (e.g. after a remount) tracks slots from scratch, so without this it could
                    // overwrite the cached value with an older one from a lagging RPC node.
                    return bridgeStoreToAsyncIterable(store, combinedSignal, value => {
                        const cachedSlot =
                            queryClient.getQueryData<SolanaRpcResponse<TItem>>(queryKey)?.context.slot ?? -1n;
                        return value.context.slot > cachedSlot;
                    });
                },
            })(context),
        [getAbortSignalRef, queryClient, specRef],
    );

    return useQuery<SolanaRpcResponse<TItem>, TError, TData, QueryKey>({
        // Sensible defaults for a long-lived stream; all overridable by `queryOptions` below.
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: Infinity,
        ...queryOptions,
        // A null spec disables the query (TanStack's `enabled: false`). Combine with the caller's own
        // `enabled` so the query runs only when the spec is present *and* not disabled.
        enabled: spec != null && (queryOptions.enabled ?? true),
        queryFn,
        queryKey: key,
    });
}
