import { createReactiveStoreWithInitialValueAndSlotTracking, type SolanaRpcResponse } from '@solana/kit';
import { useCallback, useRef } from 'react';
import type { Key as SWRKey, SWRConfiguration } from 'swr';
import useSWRSubscription, { type SWRSubscriptionOptions, type SWRSubscriptionResponse } from 'swr/subscription';

import { useIsomorphicLayoutEffect } from '../useIsomorphicLayoutEffect';
import { useLatest } from '../useLatest';
import type { TrackedDataSpec } from '../useTrackedData';
import { bridgeStoreToSWR } from './bridgeStoreToSWR';

/**
 * SWR-backed counterpart to `useTrackedData`. Pairs a one-shot RPC fetch with an ongoing
 * subscription (slot-deduped by the underlying Kit primitive) and routes the unified stream
 * through SWR's subscription cache so components reading the same `key` share one underlying
 * connection and participate in SWR's cache and devtools.
 *
 * Returns SWR's native `{ data, error }` shape. `data` is the `SolanaRpcResponse<TItem>` envelope
 * emitted by the underlying kit primitive — the primitive's type guarantees the envelope shape,
 * so callers can read `data.value` (the unified item produced by the spec's mappers) and
 * `data.context.slot` (the slot the store dedup'd on) directly.
 *
 * Pass `null` for `key` or `spec` to disable. Mirrors `useTrackedData`'s nullable-spec pattern.
 *
 * SWR subscriptions surface only `{ data, error }`, so this hook has no `refresh` and no
 * `getAbortSignal` option. To stop or restart the subscription, toggle the `key` to/from `null`.
 *
 * If the `spec` changes but the SWR `key` is stable, the existing connection stays bound to
 * the original spec — SWR caches on `key`, and `subscribe` reads the spec from a ref.
 * Bump the `key` to swap specs.
 *
 * Slot dedupe spans the SWR cache, not just one store. The underlying primitive tracks a slot
 * high-water mark per store, but that mark dies when the store is disposed (unmount, key change)
 * while the SWR cache entry survives. This hook bridges that gap: a remount's fresh store cannot
 * regress the cached envelope to an older slot — e.g. a lagging RPC node resolving the initial
 * fetch behind the cached value is refused, and the warmer cached value stands until something
 * newer arrives.
 *
 * @typeParam TInitialValue - The value inside the initial RPC `SolanaRpcResponse` envelope.
 * @typeParam TStreamValue - The value inside subscription `SolanaRpcResponse` notifications.
 * @typeParam TItem - The unified item type produced by the two mappers and surfaced as `data.value`.
 * @typeParam TError - The error type SWR will surface on failure.
 *
 * @example
 * ```tsx
 * function AccountBalance({ address }: { address: Address }) {
 *     const client = useClient<ClientWithRpc<GetBalanceApi> & ClientWithRpcSubscriptions<AccountNotificationsApi>>();
 *     const spec = useMemo(() => address ? ({
 *         initialValueSource: client.rpc.getBalance(address),
 *         initialValueMapper: (lamports: bigint) => lamports,
 *         streamSource: client.rpcSubscriptions.accountNotifications(address),
 *         streamValueMapper: ({ lamports }: { lamports: bigint }) => lamports,
 *     }) : null, [client, address]);
 *     const { data } = useTrackedDataSWR(address ? ['balance', address] : null, spec);
 *     return <p>{data ? `${data.value} lamports at slot ${data.context.slot}` : 'Loading…'}</p>;
 * }
 * ```
 */
export function useTrackedDataSWR<TInitialValue, TStreamValue, TItem, TError = unknown>(
    key: SWRKey,
    spec: TrackedDataSpec<TInitialValue, TStreamValue, TItem> | null,
    options?: SWRConfiguration<SolanaRpcResponse<TItem>, TError>,
): SWRSubscriptionResponse<SolanaRpcResponse<TItem>, TError> {
    const swrConfig = options ?? {};

    // Ref-sync the spec so an inline value passed each render doesn't change the `subscribe`
    // callback's identity. `subscribe` reads the latest spec from the ref when SWR invokes it.
    const specRef = useLatest(spec);

    // Mirror of the envelope SWR currently holds for this key. The per-subscription store tracks a
    // slot high-water mark internally, but that mark dies with the store while the SWR cache entry
    // survives — so on a remount a fresh store (high-water reset to -1) would happily forward a
    // value from a lagging RPC node at an older slot than the one already cached, regressing it.
    // The bridge reads this ref to refuse any value older than what SWR already holds. Synced after
    // commit (below), so on a remount it reflects the warm-cache value before the fresh store's
    // async initial fetch can resolve.
    const cachedDataRef = useRef<SolanaRpcResponse<TItem> | undefined>(undefined);

    const subscribe = useCallback(
        (_key: SWRKey, { next }: SWRSubscriptionOptions<SolanaRpcResponse<TItem>, TError>) => {
            const current = specRef.current;
            // defensive - we set key to null when spec is null, so `subscribe` shouldn't be called
            // with a null spec
            if (!current) return () => {};
            const store = createReactiveStoreWithInitialValueAndSlotTracking(current);
            // Drop any value older than the slot SWR already holds. A fresh store (e.g. after a
            // remount) starts tracking slots from scratch, so without this it could overwrite the
            // cached value with an older one from a lagging RPC node.
            return bridgeStoreToSWR(store, next, data => {
                const cachedSlot = cachedDataRef.current?.context.slot ?? -1n;
                return data.context.slot >= cachedSlot;
            });
            // `specRef` and `cachedDataRef` are stable refs, so listing `specRef` leaves
            // `subscribe` referentially stable across renders — SWR keys off `key`, not the
            // subscribe identity, but a stable callback avoids needless re-subscription churn.
        },
        [specRef],
    );

    // Force the key to `null` when there's no spec — either-null disables the subscription.
    const result = useSWRSubscription<SolanaRpcResponse<TItem>, TError, SWRKey>(
        spec == null ? null : key,
        subscribe,
        swrConfig,
    );

    // Keep the slot floor in sync with what SWR currently holds. Forwarded values only ever advance
    // the cached slot (the bridge refuses older ones), so this ref is monotonic per key.
    useIsomorphicLayoutEffect(() => {
        cachedDataRef.current = result.data;
    });

    return result;
}
