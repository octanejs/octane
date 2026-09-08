import {
    createReactiveStoreWithInitialValueAndSlotTracking,
    type CreateReactiveStoreWithInitialValueAndSlotTrackingConfig,
    type ReactiveStreamStore,
    type SolanaRpcResponse,
} from '@solana/kit';
import { useMemo } from 'react';

import { disabledStreamStore } from './staticStores';
import { useReactiveStoreLifecycle } from './useReactiveStoreLifecycle';
import { useTrackedDataResult } from './useTrackedDataResult';

// Module-level so it's a stable reference — keeps the `refresh` callback from
// `useReactiveStoreLifecycle` referentially stable across renders.
function fireConnect<T>(store: ReactiveStreamStore<T>, signal: AbortSignal | undefined): void {
    if (signal) store.withSignal(signal).connect();
    else store.connect();
}

/**
 * React-local alias for the Kit primitive's config. Lets the call site name the input shape as
 * `TrackedDataSpec<TInitialValue, TStreamValue, TItem>` instead of the verbose
 * `CreateReactiveStoreWithInitialValueAndSlotTrackingConfig<...>`.
 *
 * @typeParam TInitialValue - The value inside the initial RPC `SolanaRpcResponse` envelope.
 * @typeParam TStreamValue - The value inside subscription `SolanaRpcResponse` notifications.
 * @typeParam TItem - The unified item type produced by the two mappers and stored in the result.
 */
export type TrackedDataSpec<TInitialValue, TStreamValue, TItem> =
    CreateReactiveStoreWithInitialValueAndSlotTrackingConfig<TInitialValue, TStreamValue, TItem>;

/**
 * Reactive state for tracked data managed by {@link useTrackedData}.
 *
 * Lifecycle: starts at `loading` (or `disabled` when the spec is `null`) and fires both the
 * initial RPC request and the subscription on mount; transitions to `loaded` on the first
 * value (from either source — the underlying store slot-dedupes so out-of-order arrivals never
 * regress) or `error` on failure. `refresh()` re-runs the whole pair — while a refresh is in
 * flight, `status` returns to `loading` and the stale `data` and/or `error` from the prior
 * outcome remain populated (stale-while-revalidate).
 *
 * @typeParam T - The unified item type held by the store, produced by the two mappers in the
 *   spec.
 */
export type TrackedDataResult<T> = {
    /**
     * The latest value, slot-deduped across the initial RPC and the subscription, exactly as the
     * underlying kit primitive emits it: a `SolanaRpcResponse<T>` envelope (`{ context: { slot },
     * value }`). The primitive guarantees the envelope shape, so callers can read `data.value`
     * and `data.context.slot` directly without a runtime check. `undefined` on the first load
     * and while disabled. On `loading` after a prior outcome, on `error`, and on a subsequent
     * refresh, holds the last received envelope so UIs can show stale data rather than flashing
     * to blank.
     */
    data: SolanaRpcResponse<T> | undefined;
    /**
     * Error from either source, or `undefined`. Only the first error per connection window is
     * captured (the underlying store drops subsequent errors until the next `refresh()` /
     * connect). On `loading` after a prior `error`, holds the stale error so UIs can keep
     * showing the failure context while the refresh is in flight. A subsequent `loaded` clears
     * it.
     */
    error: unknown;
    /**
     * Re-run both the initial RPC request and the subscription. By default each call mints a
     * fresh signal from `getAbortSignal` (if configured) and threads it through the underlying
     * store's `withSignal(signal).connect()`. Pass `{ abortSignal }` to override the configured
     * factory for just this attempt. Pass `{ abortSignal: undefined }` to opt out of the
     * factory entirely for this attempt and run with no caller-provided signal.
     *
     * Stable reference. Safe to put in `onClick` handlers or effect deps — typically wired up
     * to a "Refresh" or "Retry" button. Calls `store.connect()` under the hood, so it always
     * (re)runs the pair regardless of current status; the bridge transitions back through
     * `loading` while preserving stale `data` and `error`.
     */
    refresh: (options?: { abortSignal?: AbortSignal | undefined }) => void;
    /**
     * Lifecycle status as a discriminated string:
     * - `loading`: an attempt is in progress. On the first attempt, `data` and `error` are
     *   `undefined`. After a refresh, `data` and `error` hold the last known values from the
     *   previous attempt (stale-while-revalidate).
     * - `loaded`: a value has arrived from either source and `error` is `undefined`.
     * - `error`: the attempt failed; `data` holds the last known value (if any).
     * - `disabled`: spec was `null` — no work was started.
     */
    status: 'disabled' | 'error' | 'loaded' | 'loading';
};

/** Options accepted by {@link useTrackedData}. */
export type UseTrackedDataOptions = {
    /**
     * Factory invoked on every attempt (initial run + every `refresh()`). The returned signal is
     * attached to that attempt via the underlying store's `withSignal(signal).connect()`, so
     * aborting it tears down both the in-flight RPC request and the subscription for that
     * attempt.
     *
     * The most common use is per-attempt timeouts:
     * `getAbortSignal: () => AbortSignal.timeout(30_000)` gives every attempt its own
     * 30-second clock that resets on `refresh()`.
     *
     * Held in a ref synced to the latest render's closure — there is no need to memoize an
     * inline factory.
     */
    getAbortSignal?: () => AbortSignal;
};

/**
 * Render reactive state for an RPC subscription seeded by a one-shot RPC fetch, slot-deduped.
 * The subscription (e.g. `accountNotifications`) is the primary source of live updates; the
 * initial fetch (e.g. `getBalance`) provides a value to surface as soon as it resolves —
 * typically before the first subscription notification arrives — so the `loading` paint is
 * shorter than subscription-only would give you. The underlying store slot-dedupes between the
 * two sources — out-of-order arrivals never regress the surfaced value.
 *
 * Pass a memoized {@link TrackedDataSpec} keyed on whatever inputs it depends on; stable identity
 * is how the hook knows when to tear down and re-run. Pass `null` to gate the work off — the
 * result reports `status: 'disabled'`.
 *
 * SSR-safe — on the server the connect effect doesn't run, so the store stays `idle` and the
 * hook reports `status: 'loading'`. The first client render hydrates from that same `loading`
 * paint, then commits the connect effect.
 *
 * @typeParam TInitialValue - The value inside the initial RPC `SolanaRpcResponse` envelope.
 * @typeParam TStreamValue - The value inside subscription `SolanaRpcResponse` notifications.
 * @typeParam TItem - The unified item type produced by the two mappers and stored in the result.
 *
 * @example
 * ```tsx
 * function AccountBalance({ address }: { address: Address }) {
 *     const client = useClient<ClientWithRpc<GetBalanceApi> & ClientWithRpcSubscriptions<AccountNotificationsApi>>();
 *     const spec = useMemo(() => ({
 *         initialValueSource: client.rpc.getBalance(address),
 *         initialValueMapper: (lamports: bigint) => lamports,
 *         streamSource: client.rpcSubscriptions.accountNotifications(address),
 *         streamValueMapper: ({ lamports }: { lamports: bigint }) => lamports,
 *     }), [client, address]);
 *     const { data, error, refresh } = useTrackedData(spec);
 *     if (error) return <button onClick={refresh}>Retry</button>;
 *     return <p>{data ? `${data.value} lamports at slot ${data.context.slot}` : 'Loading…'}</p>;
 * }
 * ```
 *
 * @see {@link TrackedDataResult}
 * @see {@link UseTrackedDataOptions}
 */
export function useTrackedData<TInitialValue, TStreamValue, TItem>(
    spec: TrackedDataSpec<TInitialValue, TStreamValue, TItem> | null,
    options?: UseTrackedDataOptions,
): TrackedDataResult<TItem> {
    // One store per `spec`. Both creation paths return an `idle` store; the initial connect
    // lives in the lifecycle effect below so the memo body stays pure (StrictMode's dev
    // double-render, and any future render-discard, won't fire a network request from a
    // discarded render).
    const store = useMemo(() => {
        if (spec == null) return disabledStreamStore<SolanaRpcResponse<TItem>>();
        return createReactiveStoreWithInitialValueAndSlotTracking(spec);
    }, [spec]);

    // Connect on commit, reset on store change / unmount, and expose the stable `refresh`
    // callback. `store.reset()` aborts the active attempt via the store's internal controller, so
    // under StrictMode's mount → cleanup → mount sequence the first connect is properly aborted
    // before the second one fires. `disabledStreamStore` returns a store whose `connect`/`reset`
    // are no-ops, so the null-spec case needs no explicit gate.
    const refresh = useReactiveStoreLifecycle(store, fireConnect, options?.getAbortSignal);

    return useTrackedDataResult(store, refresh, spec == null);
}
