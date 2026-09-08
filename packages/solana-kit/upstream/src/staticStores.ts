import { ReactiveActionStore, ReactiveState, ReactiveStreamStore } from '@solana/kit';

const DISABLED_ACTION_STATE = Object.freeze({
    data: undefined,
    error: undefined,
    status: 'idle' as const,
});

const IDLE_STREAM_STATE: ReactiveState<never> = Object.freeze({
    data: undefined,
    error: undefined,
    status: 'idle',
});

const noopUnsubscribe = () => {};
const noopSubscribe = () => noopUnsubscribe;
const rejectedAbortError = (): Promise<never> => Promise.reject(new DOMException('Aborted', 'AbortError'));

/**
 * A {@link ReactiveActionStore} that never transitions out of `idle` and rejects any attempt to
 * dispatch. Returned by `useRequest` (and other action-store hooks) when their factory function
 * returns `null`, signalling that the call should be gated off — for example because a required
 * input (an address, a query string) is not yet known.
 *
 * The hook's result bridge maps this store's `idle` state to a `disabled` status so call sites
 * can distinguish "not enabled" from "loading" without an extra flag.
 */
export function disabledActionStore<T>(): ReactiveActionStore<[], T> {
    return {
        dispatch: noopUnsubscribe,
        dispatchAsync: rejectedAbortError,
        getState: () => DISABLED_ACTION_STATE,
        reset: noopUnsubscribe,
        subscribe: noopSubscribe,
        withSignal: () => ({
            dispatch: noopUnsubscribe,
            dispatchAsync: rejectedAbortError,
        }),
    };
}

/**
 * A {@link ReactiveStreamStore} that never transitions out of `idle` and ignores every
 * `connect` / `reset` / `subscribe` call. Returned by `useSubscription` when its
 * source is `null`, signalling that the subscription should be gated off — for example because
 * a required input (an address) is not yet known.
 *
 * The hook's result bridge maps this store's `idle` state to a `disabled` status so call sites
 * can distinguish "not enabled" from "loading" without an extra flag.
 */
export function disabledStreamStore<T>(): ReactiveStreamStore<T> {
    return {
        connect: noopUnsubscribe,
        getState: () => IDLE_STREAM_STATE,
        reset: noopUnsubscribe,
        subscribe: noopSubscribe,
        withSignal: () => ({ connect: noopUnsubscribe }),
    };
}
