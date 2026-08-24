import type { ReactiveStreamStore, SolanaRpcResponse } from '@solana/kit';
import { useMemo, useSyncExternalStore } from 'react';

import type { TrackedDataResult } from './useTrackedData';

/**
 * Subscribes to a {@link ReactiveStreamStore} whose value is always shaped as
 * `SolanaRpcResponse<TItem>` (which is what `createReactiveStoreWithInitialValueAndSlotTracking`
 * produces) and maps its `idle | loading | loaded | error` lifecycle onto the
 * {@link TrackedDataResult} shape consumed by `useTrackedData`. The envelope passes through
 * unchanged — callers read `data.value` and `data.context.slot` directly.
 *
 * `idle` is ambiguous on its own: it covers both "no spec — store is disabled" and "real spec,
 * connect effect hasn't fired yet on the current render." The `disabled` flag disambiguates:
 * disabled → `status: 'disabled'`, enabled → `status: 'loading'` (the connect is about to fire
 * on commit; consumers see a single `loading` paint rather than briefly flashing `disabled`).
 *
 * Stale-while-revalidate flows naturally through `state.data` / `state.error`, which the store
 * preserves across `loading` transitions, so the bridge doesn't need to mirror them.
 *
 * @param store - The store to subscribe to.
 * @param refresh - A stable callback that re-runs the initial RPC and the subscription.
 *   Forwarded to the result so call sites have a single, hook-owned recovery affordance.
 * @param disabled - When `true`, the result reports `status: 'disabled'`. Used by
 *   `useTrackedData` to signal the null-spec case.
 *
 * @internal
 */
export function useTrackedDataResult<TItem>(
    store: ReactiveStreamStore<SolanaRpcResponse<TItem>>,
    refresh: (options?: { abortSignal?: AbortSignal | undefined }) => void,
    disabled: boolean,
): TrackedDataResult<TItem> {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
    return useMemo(() => {
        const status: TrackedDataResult<TItem>['status'] =
            state.status === 'idle' ? (disabled ? 'disabled' : 'loading') : state.status;
        return { data: state.data, error: state.error, refresh, status };
    }, [state, refresh, disabled]);
}
