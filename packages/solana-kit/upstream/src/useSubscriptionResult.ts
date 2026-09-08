import { ReactiveStreamStore } from '@solana/kit';
import { useMemo, useSyncExternalStore } from 'react';

import { SubscriptionResult } from './useSubscription';

/**
 * Subscribes to a {@link ReactiveStreamStore} and maps its
 * `idle | loading | loaded | error` lifecycle onto the {@link SubscriptionResult} shape
 * consumed by `useSubscription`. The notification passes through unchanged.
 *
 * For status we map the `idle` state to either `loading` or `disabled`, depending on the
 * `disabled` param. This is because `useSubscription` automatically connects, so we treat
 * `idle` as `loading` when a source is present and `disabled` when it's not.
 *
 * Stale-while-revalidate flows naturally through `state.data` / `state.error`, which the store
 * preserves across `loading` transitions, so the bridge doesn't need to mirror them.
 *
 * @param store - The store to subscribe to.
 * @param reconnect - A stable callback that re-opens the stream. Forwarded to the result so call
 *   sites have a single, hook-owned recovery affordance.
 * @param disabled - When `true`, the result reports `status: 'disabled'`. Used by
 *   `useSubscription` to signal the null-source case.
 *
 * @internal
 */
export function useSubscriptionResult<T>(
    store: ReactiveStreamStore<T>,
    reconnect: (options?: { abortSignal?: AbortSignal | undefined }) => void,
    disabled: boolean,
): SubscriptionResult<T> {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
    return useMemo(() => {
        const status: SubscriptionResult<T>['status'] =
            state.status === 'idle' ? (disabled ? 'disabled' : 'loading') : state.status;
        return { data: state.data, error: state.error, reconnect, status };
    }, [state, reconnect, disabled]);
}
