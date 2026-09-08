import { ReactiveActionStore } from '@solana/kit';
import { useMemo, useSyncExternalStore } from 'react';

import { RequestResult } from './useRequest';

/**
 * Subscribes to a {@link ReactiveActionStore} and maps its `idle | running | success | error`
 * lifecycle onto the {@link RequestResult} shape consumed by `useRequest`.
 *
 * `idle` is ambiguous on its own: it covers both "no source — store is disabled" and "real source,
 * dispatch effect hasn't fired yet on the current render." The `disabled` flag disambiguates:
 * disabled → `status: 'disabled'`, enabled → `status: 'fetching'` (the dispatch is about to fire
 * on commit; consumers see a single `fetching` paint rather than briefly flashing `disabled`).
 *
 * - `idle` + disabled → `disabled`
 * - `idle` + enabled → `fetching` (first paint, dispatch effect about to commit)
 * - `running` → `fetching` (caller inspects `data` / `error` to know if there's stale content)
 * - `success` → `success`
 * - `error` → `error`
 *
 * The action store's built-in stale-while-revalidate carries `state.data` and `state.error`
 * across attempts, so the bridge doesn't need to mirror them.
 *
 * @internal
 */
export function useRequestResult<T>(
    store: ReactiveActionStore<[], T>,
    refresh: (options?: { abortSignal?: AbortSignal | undefined }) => void,
    disabled: boolean,
): RequestResult<T> {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
    return useMemo(() => {
        const status: RequestResult<T>['status'] =
            state.status === 'idle'
                ? disabled
                    ? 'disabled'
                    : 'fetching'
                : state.status === 'running'
                  ? 'fetching'
                  : state.status; // 'success' | 'error'
        return {
            data: state.data,
            error: state.error,
            refresh,
            status,
        };
    }, [state, refresh, disabled]);
}
