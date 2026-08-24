import {
    type ReactiveStreamStore,
    SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR,
    SolanaError,
} from '@solana/kit';

/**
 * Bridges a {@link ReactiveStreamStore} into the `AsyncIterable` contract that TanStack Query's
 * `experimental_streamedQuery` consumes. The TanStack twin of `bridgeStoreToSwr`: where the SWR
 * bridge pushes each store update into a `next` callback, this one exposes a *pull*-based async
 * iterable, since `streamedQuery` drives the stream by `for await`-ing it.
 *
 * Subscribes to the store, `connect()`s it bound to `signal`, and yields its unified lifecycle:
 * - `loaded` → yields the value, unless an optional `shouldYield` predicate rejects it. Latest-wins:
 *   if several notifications land between pulls, only the most recent unconsumed value is yielded (a
 *   subscription consumer wants the freshest state, not a backlog).
 * - `error` → throws, so the `streamedQuery` queryFn rejects and the query surfaces `error`.
 *   Substitutes a {@link SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR} sentinel when the
 *   store reports an error with a nullish payload (mirrors `bridgeStoreToSwr`). An error takes
 *   precedence over a buffered value: if a `loaded` value is still pending when an `error` arrives,
 *   that value is dropped and the error propagates (once errored, stop yielding).
 * - `signal` aborts → ends the iterable cleanly (no error). An abort means teardown — unmount, a
 *   superseding refetch, or a caller-supplied deadline — so the subscription stops rather than
 *   failing.
 *
 * Whichever way the iterable ends — value exhaustion, error, or abort — the `finally` block
 * unsubscribes and `reset()`s the store, aborting the active connection. The store the caller hands
 * in is owned by this bridge for the iterable's lifetime.
 *
 * @typeParam T - The notification type emitted by the store.
 *
 * @param store - An idle stream store to drive.
 * @param signal - The abort signal to bind the connection to (TanStack's query-cancellation signal,
 *   optionally combined with a caller-supplied one). Aborting it tears the stream down.
 * @param shouldYield - Optional gate run against each `loaded` value before it is yielded. Return
 *   `false` to drop the value. When omitted, every loaded value is yielded.
 *
 * @returns An `AsyncIterable<T>` that yields each store value until the store errors or `signal`
 *   aborts.
 *
 * @internal
 */
export function bridgeStoreToAsyncIterable<T>(
    store: ReactiveStreamStore<T>,
    signal: AbortSignal,
    shouldYield?: (value: T) => boolean,
): AsyncIterable<T> {
    return {
        async *[Symbol.asyncIterator](): AsyncIterator<T> {
            // Latest-wins single-slot buffer plus a one-shot "something changed" deferred the loop
            // parks on. `wake()` resolves the current deferred and arms a fresh one for the next park.
            let latest: { readonly value: T } | undefined;
            let failure: { readonly error: unknown } | undefined;
            let deferred = Promise.withResolvers<void>();
            const wake = () => {
                const { resolve } = deferred;
                deferred = Promise.withResolvers<void>();
                resolve();
            };

            const onChange = () => {
                const state = store.getState();
                if (state.status === 'loaded') {
                    // Drop a value the gate rejects. The stream parks again rather than yielding it.
                    if (shouldYield && !shouldYield(state.data)) return;
                    latest = { value: state.data };
                    wake();
                } else if (state.status === 'error') {
                    // A nullish error would otherwise surface as a value-less success; substitute a
                    // sentinel so the failure propagates, matching `bridgeStoreToSwr`.
                    failure = {
                        error: state.error ?? new SolanaError(SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR),
                    };
                    wake();
                }
                // `idle` / `loading` carry no value and no error — nothing to yield.
            };

            const onAbort = () => wake();
            signal.addEventListener('abort', onAbort, { once: true });
            const unsubscribe = store.subscribe(onChange);
            // Bind the connection to `signal` so an abort tears down the underlying stream too.
            store.withSignal(signal).connect();
            try {
                while (true) {
                    // Abort wins over everything: an abort is teardown, so end cleanly without
                    // surfacing the store's incidental abort-driven error state.
                    if (signal.aborted) return;
                    if (failure) throw failure.error;
                    if (latest) {
                        const { value } = latest;
                        latest = undefined;
                        yield value;
                        continue;
                    }
                    await deferred.promise;
                }
            } finally {
                signal.removeEventListener('abort', onAbort);
                unsubscribe();
                store.reset();
            }
        },
    };
}
