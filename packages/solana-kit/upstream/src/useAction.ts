import { createReactiveActionStore } from '@solana/kit';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

/**
 * Reactive state and controls for an async action managed by {@link useAction}
 * (and plugin-specific hooks built on top of it).
 *
 * Lifecycle: starts at `idle`. Each `dispatch(...)` flips to `running`, then to `success` or
 * `error` depending on the outcome. `data` from a prior `success` and `error` from a prior failure
 * both persist through subsequent `running` states for stale-while-revalidate UX. `success` clears
 * `error`; only `reset()` clears `data`.
 *
 * Calling `dispatch(...)` while a previous call is in flight aborts the first via its
 * `AbortSignal` and replaces it. Fire-and-forget `dispatch` callers never observe this; awaiters of
 * a superseded `dispatchAsync` call see a rejection with an `AbortError`, filterable via
 * `isAbortError` from `@solana/promises`.
 *
 * @typeParam TArgs - The argument tuple `dispatch` accepts; forwarded to the wrapped function
 *   after the abort signal.
 * @typeParam TResult - The value the wrapped function resolves to on success.
 */
export type ActionResult<TArgs extends readonly unknown[], TResult> = {
    /** The result on success, or `undefined` if no successful call has happened yet. */
    data: TResult | undefined;
    /**
     * Trigger the action and forget it. Returns `undefined` synchronously and never throws —
     * failures surface on `status` / `error`, and superseded or `reset()`-aborted calls produce no
     * state change. This is the variant to wire into UI event handlers (`onClick={() => dispatch()}`):
     * there is no promise to handle, so it can't produce an unhandled rejection. Calling `dispatch`
     * again while a prior call is in flight aborts the first. Stable reference.
     *
     * @see {@link ActionResult.dispatchAsync} when you need the resolved value or propagated errors.
     */
    dispatch: (...args: TArgs) => void;
    /**
     * Trigger the action and await the outcome. Resolves with the wrapped function's result, or
     * rejects with the thrown error. Calling `dispatch`/`dispatchAsync` again while a prior call is
     * in flight aborts the first and rejects its promise with an `AbortError`. Stable reference.
     *
     * Mirrors `ReactiveActionStore.dispatchAsync`. Use this from imperative callers that read the
     * resolved value (e.g. to navigate on success); filter supersede rejections with `isAbortError`
     * from `@solana/promises`. Prefer {@link ActionResult.dispatch} from event handlers that don't
     * await — its returned promise, left unhandled, surfaces every supersede/abort as an
     * `unhandledrejection`.
     */
    dispatchAsync: (...args: TArgs) => Promise<TResult>;
    /**
     * The error from the most recent failed call, or `undefined`. Persists through a subsequent
     * `running` state so UIs can keep showing the prior failure while a retry is in flight; a
     * subsequent `success` clears it.
     */
    error: unknown;
    /** `true` when `status === 'error'`. */
    isError: boolean;
    /** `true` when `status === 'idle'`. */
    isIdle: boolean;
    /** `true` when `status === 'running'` — a dispatch is in flight. */
    isRunning: boolean;
    /** `true` when `status === 'success'`. */
    isSuccess: boolean;
    /** Reset state back to `idle`, aborting any in-flight call. Stable reference. */
    reset: () => void;
    /**
     * The current lifecycle status as a discriminated string. The `isIdle` / `isRunning` /
     * `isSuccess` / `isError` booleans below are derived from this — pick whichever reads better
     * at the call site.
     */
    status: 'error' | 'idle' | 'running' | 'success';
};

/**
 * Bridge an arbitrary async function into a reactive {@link ActionResult}. Each `dispatch(...)`
 * call runs the function with a fresh {@link AbortSignal} and tracks its lifecycle through React
 * state; a second call while a first is in flight aborts the first.
 *
 * `fn` is held in a ref that always points at the latest closure — there is no `deps` array to
 * maintain. Each `dispatch(...)` invokes the most recently rendered `fn`, so values captured
 * inside (e.g. form state, route params) are always fresh without explicit dependency tracking.
 * In-flight calls are unaffected — they continue with the closure they captured at dispatch time.
 *
 * @typeParam TArgs - The argument tuple `dispatch` accepts; forwarded to `fn` after the abort
 *   signal.
 * @typeParam TResult - The value `fn` resolves to on success.
 *
 * @example
 * ```tsx
 * import { useAction } from '@solana/react';
 *
 * function PostMessageButton({ url, body }: { url: string; body: string }) {
 *     const { dispatch, isRunning, error } = useAction(async (signal, content: string) => {
 *         const res = await fetch(url, { body: content, method: 'POST', signal });
 *         if (!res.ok) throw new Error(`HTTP ${res.status}`);
 *         return res.json() as Promise<{ id: string }>;
 *     });
 *     return (
 *         <button disabled={isRunning} onClick={() => dispatch(body)}>
 *             {isRunning ? 'Posting…' : error ? 'Retry' : 'Post'}
 *         </button>
 *     );
 * }
 * ```
 *
 * @see {@link ActionResult}
 */
export function useAction<TArgs extends readonly unknown[], TResult>(
    fn: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>,
): ActionResult<TArgs, TResult> {
    // Stable callback over the latest closure. Similar to `useEffectEvent`, but we need to
    // pass the callback to `createReactiveActionStore` so need to implement the pattern manually.
    const fnRef = useRef(fn);
    useIsomorphicLayoutEffect(() => {
        fnRef.current = fn;
    });

    // `createReactiveActionStore` only reads the callback when the returned `dispatch` is
    // called, not during render. The `react-hooks/refs` rule doesn't know that, so we silence it.
    // eslint-disable-next-line react-hooks/refs
    const [store] = useState(() =>
        createReactiveActionStore<TArgs, TResult>((signal, ...args) => fnRef.current(signal, ...args)),
    );

    // Reset on unmount so any in-flight call is aborted and state is dropped.
    useEffect(() => () => store.reset(), [store]);

    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

    return useMemo(
        () => ({
            data: state.data,
            dispatch: store.dispatch,
            dispatchAsync: store.dispatchAsync,
            error: state.error,
            isError: state.status === 'error',
            isIdle: state.status === 'idle',
            isRunning: state.status === 'running',
            isSuccess: state.status === 'success',
            reset: store.reset,
            status: state.status,
        }),
        [state, store],
    );
}
