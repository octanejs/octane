import type { ReactiveStreamSource } from '@solana/kit';
import { useCallback } from 'react';
import type { Key as SWRKey, SWRConfiguration } from 'swr';
import useSWRSubscription, { type SWRSubscriptionOptions, type SWRSubscriptionResponse } from 'swr/subscription';

import { useLatest } from '../useLatest';
import { bridgeStoreToSWR } from './bridgeStoreToSWR';

/**
 * SWR-backed counterpart to `useSubscription`. Routes a `ReactiveStreamSource<T>` through SWR's
 * subscription cache (`useSWRSubscription`) so components reading the same `key` share one
 * underlying connection and participate in SWR's devtools / cache layer.
 *
 * Returns SWR's native `{ data, error }` shape. `data` is the notification exactly as the source
 * emits it. For RPC subscriptions that emit `SolanaRpcResponse<U>` notifications, read the inner
 * value at `data.value` and the slot at `data.context.slot`. For raw notifications, `data`
 * is the raw shape.
 *
 * Pass `null` for `key` or `source` to disable.
 *
 * SWR subscriptions surface only `{ data, error }`, so this hook has no `reconnect` and no
 * `getAbortSignal` option. To stop or restart a subscription, toggle the `key` to/from `null`.
 *
 * If the `source` changes but the SWR `key` is stable, the existing connection stays bound to
 * the original source — SWR caches on `key`, and `subscribe` reads the source from a ref.
 * Bump the `key` to swap sources.
 *
 * @typeParam T - The notification type emitted by the source.
 * @typeParam TError - The error type SWR will surface on failure.
 *
 * @example
 * ```tsx
 * function AccountBalance({ address }: { address: Address }) {
 *     const client = useClient<ClientWithRpcSubscriptions<AccountNotificationsApi>>();
 *     const { data, error } = useSubscriptionSWR(
 *         address ? ['account', address] : null,
 *         address ? client.rpcSubscriptions.accountNotifications(address) : null,
 *     );
 *     if (error) return <p>Failed to connect.</p>;
 *     if (!data) return <p>Connecting…</p>;
 *     return <p>{data.value.lamports} lamports at slot {data.context.slot}</p>;
 * }
 * ```
 */
export function useSubscriptionSWR<T, TError = unknown>(
    key: SWRKey,
    source: ReactiveStreamSource<T> | null,
    options?: SWRConfiguration<T, TError>,
): SWRSubscriptionResponse<T, TError> {
    const swrConfig = options ?? {};

    // Ref-sync the source so an inline value passed each render doesn't change the `subscribe`
    // callback's identity. `subscribe` reads the latest source from the ref when SWR invokes it.
    const sourceRef = useLatest(source);

    const subscribe = useCallback(
        (_key: SWRKey, { next }: SWRSubscriptionOptions<T, TError>) => {
            const current = sourceRef.current;
            // defensive - we set key to null when source is null, so `subscribe` shouldn't be called
            // with a null source
            if (!current) return () => {};
            // Note: while SWR doesn't sync an initial state like `useSyncExternalStore`
            // the `.reactiveStore()` contract returns an idle store, which stays idle
            // until we `connect`. So we don't need to forward an initial state here.
            return bridgeStoreToSWR(current.reactiveStore(), next);
            // `sourceRef` is a stable ref from `useLatest`, so listing it leaves `subscribe`
            // referentially stable across renders — SWR keys off `key`, not the subscribe
            // identity, but a stable callback avoids needless re-subscription churn.
        },
        [sourceRef],
    );
    // Force the key to `null` when there's no source — either-null disables the subscription.
    return useSWRSubscription<T, TError, SWRKey>(source == null ? null : key, subscribe, swrConfig);
}
