import {
    type ReactiveStreamStore,
    SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR,
    SolanaError,
} from '@solana/kit';
import type { SWRSubscriptionOptions } from 'swr/subscription';

/**
 * Bridges a {@link ReactiveStreamStore} into SWR's `useSWRSubscription` callback contract. Shared
 * by the stream-store-backed SWR subscription hooks (`useSubscriptionSWR`, and the slot-deduping
 * `useTrackedDataSWR` built on the same shape) so the store-to-`next` plumbing lives in one place.
 *
 * Subscribes to the store, connects it, and forwards its unified lifecycle to SWR's `next`:
 * - `loaded` → `next(null, data)`, unless an optional `shouldForward` predicate rejects the value
 * - `error` → `next(error)`, substituting a
 *   {@link SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR} sentinel when the store reports
 *   an error with a nullish payload. SWR treats a nullish first argument to `next` as a *success*
 *   update, so without the sentinel the failure would be swallowed.
 *
 * The caller owns store creation (so it can pick the store factory) but not the lifecycle: the
 * helper calls `connect()` and returns the teardown SWR expects, which unsubscribes and resets the
 * store (aborting the active connection via the store's internal controller).
 *
 * @typeParam T - The notification type emitted by the store.
 * @typeParam TError - The error type SWR will surface on failure.
 *
 * @param store - An idle stream store to drive.
 * @param next - SWR's `next` callback, from {@link SWRSubscriptionOptions}.
 * @param shouldForward - Optional gate run against each `loaded` value before it reaches `next`.
 *   Return `false` to drop the value (e.g. a data freshness check). When omitted, every loaded value
 *   is forwarded.
 *
 * @returns The unsubscribe/reset cleanup for SWR's `subscribe` to return.
 *
 * @internal
 */
export function bridgeStoreToSWR<T, TError>(
    store: ReactiveStreamStore<T>,
    next: SWRSubscriptionOptions<T, TError>['next'],
    shouldForward?: (data: T) => boolean,
): () => void {
    const unsubscribe = store.subscribe(() => {
        const state = store.getState();
        if (state.status === 'loaded') {
            if (shouldForward && !shouldForward(state.data)) return;
            next(null, state.data);
        } else if (state.status === 'error') {
            // SWR's `next` treats a nullish error as a *success* update. If our store has
            // `status: 'error'` but the error is nullish, substitute a sentinel so the failure
            // surfaces.
            const error =
                state.error == null
                    ? new SolanaError(SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR)
                    : state.error;
            next(error as TError);
        }
    });
    store.connect();
    return () => {
        unsubscribe();
        store.reset();
    };
}
