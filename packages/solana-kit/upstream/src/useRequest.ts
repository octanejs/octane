import { createReactiveActionStore, ReactiveActionSource, ReactiveActionStore } from '@solana/kit';
import { useMemo } from 'react';

import { disabledActionStore } from './staticStores';
import { useReactiveStoreLifecycle } from './useReactiveStoreLifecycle';
import { useRequestResult } from './useRequestResult';

// Module-level so it's a stable reference — keeps the `refresh` callback from
// `useReactiveStoreLifecycle` referentially stable across renders.
function fireAction<T>(store: ReactiveActionStore<[], T>, signal: AbortSignal | undefined): void {
    if (signal) store.withSignal(signal).dispatch();
    else store.dispatch();
}

/**
 * Reactive state for a one-shot request managed by {@link useRequest}.
 *
 * Lifecycle: starts at `fetching` (or `disabled` when the source is `null`) and auto-fires on
 * mount; transitions to `success` on success or `error` on failure. `refresh()` re-fires the
 * request — while a re-fire is in flight, `status` returns to `fetching` and the stale `data`
 * and/or `error` from the prior outcome remain populated (stale-while-revalidate).
 *
 * @typeParam T - The value the underlying request resolves to.
 */
export type RequestResult<T> = {
    /**
     * The most recent successful value, or `undefined` if no call has succeeded yet (or while
     * disabled). Persists across subsequent refreshes (including failed ones) until a new success
     * replaces it or `reset()` clears the store.
     */
    data: T | undefined;
    /**
     * The error from the most recent failed call, or `undefined` if no call has failed (or while
     * disabled). Persists across subsequent refreshes until a new success clears it. May coexist
     * with `data` when a successful attempt is followed by a failing one.
     */
    error: unknown;
    /**
     * Re-fire the request. By default each call mints a fresh signal from `getAbortSignal` (if
     * configured) and threads it through the underlying store's
     * `withSignal(signal).dispatch()`. Pass `{ abortSignal }` to override the configured factory
     * for just this attempt. Pass `{ abortSignal: undefined }` to opt out of the factory entirely
     * for this attempt and fire with no caller-provided signal.
     *
     * Stable reference.
     */
    refresh: (options?: { abortSignal?: AbortSignal | undefined }) => void;
    /**
     * Lifecycle status as a discriminated string:
     * - `fetching`: a request is in flight. `data` and `error` carry whatever stale content was
     *   available before this attempt (both `undefined` on the first attempt; either or both
     *   populated on a refresh after a prior outcome).
     * - `success`: most recent call succeeded; `data` holds the result.
     * - `error`: most recent call failed; `error` holds the reason.
     * - `disabled`: source was `null`.
     */
    status: 'disabled' | 'error' | 'fetching' | 'success';
};

/** Options accepted by {@link useRequest}. */
export type UseRequestOptions = {
    /**
     * Factory invoked on every attempt (initial fire + every `refresh()`). The returned signal is
     * attached to that attempt via the underlying store's `withSignal(signal).dispatch()`, so
     * aborting it cancels just the current attempt.
     *
     * The most common use is per-attempt timeouts: `getAbortSignal: () => AbortSignal.timeout(5000)`
     * gives every attempt its own 5-second clock that resets on `refresh()`.
     *
     * Held in a ref synced to the latest render's closure — there is no need to memoize an inline
     * factory.
     */
    getAbortSignal?: () => AbortSignal;
};

/**
 * Fire a one-shot request on mount and re-fire each time `source` changes identity or `refresh()`
 * is called. Returns reactive state tracking the call's lifecycle.
 *
 * Two ways to pass the work:
 *
 * - A {@link ReactiveActionSource} — the `{ reactiveStore() }` duck-type satisfied by
 *   `PendingRpcRequest`.
 * - An async function `(signal: AbortSignal) => Promise<T>` — wrap any one-shot async source
 *   (a `fetch`, a third-party SDK call, etc). Most general shape.
 *
 * Pass `null` to disable; the result reports `status: 'disabled'`.
 *
 * Memoize the input (`useMemo` for a source, `useCallback` for a function) keyed on whatever
 * inputs it depends on.
 *
 * @typeParam T - The value the underlying request resolves to.
 *
 * @example
 * ```tsx
 * function LatestBlockhash() {
 *     const client = useClient<ClientWithRpc<GetLatestBlockhashApi>>();
 *     const source = useMemo(() => client.rpc.getLatestBlockhash(), [client]);
 *     const { data, error, refresh } = useRequest(source, {
 *         getAbortSignal: () => AbortSignal.timeout(5_000),
 *     });
 *     if (error) return <button onClick={refresh}>Retry</button>;
 *     return <p>{data ? `Blockhash: ${data.value.blockhash}` : 'Loading…'}</p>;
 * }
 *
 * // Function shape — wraps an arbitrary async call:
 * function Profile({ userId }: { userId: string }) {
 *     const fetcher = useCallback(
 *         (signal: AbortSignal) => fetch(`/api/users/${userId}`, { signal }).then(r => r.json()),
 *         [userId],
 *     );
 *     const { data, error, refresh } = useRequest(fetcher);
 *     if (error) return <button onClick={refresh}>Retry</button>;
 *     return <p>{data ? data.name : 'Loading…'}</p>;
 * }
 * ```
 *
 * @see {@link RequestResult}
 * @see {@link UseRequestOptions}
 */
export function useRequest<T>(
    source: ReactiveActionSource<T> | ((signal: AbortSignal) => Promise<T>) | null,
    options?: UseRequestOptions,
): RequestResult<T> {
    // One store per `source`. Both creation paths return an `idle` store; the initial dispatch
    // lives in the lifecycle effect below so the memo body stays pure (StrictMode's dev
    // double-render, and any future render-discard, won't fire a network request from a discarded
    // render).
    //
    // Note: `useMemo` is permitted to discard memoized values across renders (independent of deps);
    // if React ever does so here, the discard surfaces as a fresh store with empty `data` /
    // `error` and an immediate refetch — same shape as a remount. In practice this doesn't happen,
    // but if React changes and it becomes an issue, we'd need to rework this.
    const store = useMemo(() => {
        if (source == null) return disabledActionStore<T>();
        return typeof source === 'function' ? createReactiveActionStore<[], T>(source) : source.reactiveStore();
    }, [source]);

    // Fire on commit, reset on store change / unmount, and expose the stable `refresh` callback.
    // `store.reset()` aborts the in-flight request via the action store's internal controller, so
    // under StrictMode's mount → cleanup → mount sequence the first dispatch is properly aborted
    // before the second one fires.
    const refresh = useReactiveStoreLifecycle(store, fireAction, options?.getAbortSignal);

    return useRequestResult(store, refresh, source == null);
}
