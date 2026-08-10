import { useCallback, useEffect, useRef } from 'react';

import { useLatest } from './useLatest';

/**
 * Options accepted by the `refresh`-style callback returned from {@link useReactiveStoreLifecycle}.
 *
 * @internal
 */
type RefireOptions = {
    /**
     * Override the configured `getAbortSignal` factory for this attempt. Passing the key at all
     * (even as `undefined`) opts out of the factory; omitting it falls back to the factory.
     */
    abortSignal?: AbortSignal | undefined;
};

// In dev, warn when the store identity changes this many times inside `CHURN_WINDOW_MS`. A handful
// of recreations is normal (StrictMode's mount/cleanup/mount, an occasional dependency change); a
// burst this large within a second only happens when an unmemoized `source`/`spec` mints a fresh
// store every render — the self-sustaining dispatch/abort loop. Set well above any legitimate churn.
const CHURN_WARNING_THRESHOLD = 25;
const CHURN_WINDOW_MS = 1_000;

/**
 * Shared lifecycle for the source-keyed reactive-store hooks (`useRequest`, and the stream-store
 * hooks built on the same shape). Owns the three pieces each of them otherwise repeats verbatim:
 *
 * - ref-syncs `getAbortSignal` so an inline factory passed every render doesn't churn the caller's
 *   store memo,
 * - fires the store on commit and resets it on teardown / store-identity change,
 * - returns a stable `refresh`-style callback carrying the presence-based signal override.
 *
 * `fire` performs the store's "go" verb — `dispatch` for action stores, `connect` for stream
 * stores — optionally with a per-attempt {@link AbortSignal}. Pass it as a stable (module-level)
 * function so the returned callback stays referentially stable.
 *
 * In development it also emits a `console.error` when the store identity changes far more often
 * than legitimate use would explain, which is the signature of an unmemoized `source`/`spec`
 * driving an infinite dispatch/abort loop.
 *
 * @typeParam TStore - The reactive store type; only its `reset()` method is needed here.
 *
 * @param store - The store to drive; recreated by the caller whenever the source identity changes.
 * @param fire - Performs the store's go verb, optionally with a per-attempt signal.
 * @param getAbortSignal - Optional factory invoked per attempt to mint a fresh signal.
 *
 * @returns A stable callback that re-fires the store, accepting the per-attempt signal override.
 *
 * @internal
 */
export function useReactiveStoreLifecycle<TStore extends { reset(): void }>(
    store: TStore,
    fire: (store: TStore, signal: AbortSignal | undefined) => void,
    getAbortSignal: (() => AbortSignal) | undefined,
): (options?: RefireOptions) => void {
    const getAbortSignalRef = useLatest(getAbortSignal);

    const refresh = useCallback(
        (options?: RefireOptions) => {
            // Presence-based override: an explicit `abortSignal` key (even `undefined`) opts out
            // of the factory for this attempt. Omitting the key falls back to the factory.
            const signal = options && 'abortSignal' in options ? options.abortSignal : getAbortSignalRef.current?.();
            fire(store, signal);
        },
        // `getAbortSignalRef` is a stable ref and `fire` a stable (module-level) function, so
        // `refresh` only changes identity when `store` does.
        [fire, getAbortSignalRef, store],
    );

    // Dev-only churn guard. This effect re-runs once per store identity (deps include `store`), so
    // counting its runs within a rolling window flags an unmemoized `source`/`spec` that mints a
    // fresh store every render. Counting lives here, not in render, so there's no render-phase
    // ref mutation for StrictMode to flag.
    const churnRef = useRef({ count: 0, warned: false, windowStart: 0 });

    useEffect(() => {
        if (__DEV__) {
            const churn = churnRef.current;
            const now = Date.now();
            if (now - churn.windowStart > CHURN_WINDOW_MS) {
                churn.windowStart = now;
                churn.count = 0;
            }
            if (++churn.count > CHURN_WARNING_THRESHOLD && !churn.warned) {
                churn.warned = true;

                console.error(
                    'A reactive-store hook (e.g. `useRequest`) recreated its store %d times within ' +
                        '1s. This almost always means the `source`/`spec` passed to it is a fresh ' +
                        'reference on every render — wrap it in `useMemo`/`useCallback` keyed on its ' +
                        'inputs. Each recreation aborts the in-flight request before it can complete, ' +
                        'so nothing ever loads.',
                    churn.count,
                );
            }
        }
        refresh();
        return () => store.reset();
    }, [refresh, store]);

    return refresh;
}
