# @solana/react

## 7.0.0

### Major Changes

- [#1780](https://github.com/anza-xyz/kit/pull/1780) [`acec0be`](https://github.com/anza-xyz/kit/commit/acec0be468340a7367f78fe8a8ed61ed8a16e553) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Streamline the `ReactiveStreamStore` contract by removing deprecated members and unifying its state accessor with `ReactiveActionStore`. The `getUnifiedState()` method has been renamed to `getState()`, and the deprecated value-only `getState()`, `getError()`, and `retry()` members along with the `ReactiveStore` type alias have been removed.

    **BREAKING CHANGES**

    **`getUnifiedState()` renamed to `getState()`.** The unified `{ data, error, status }` snapshot accessor is now simply `getState()`, matching `ReactiveActionStore.getState()`.

    ```diff
    - const state = useSyncExternalStore(store.subscribe, store.getUnifiedState);
    + const state = useSyncExternalStore(store.subscribe, store.getState);
    ```

    **Removed the deprecated value-only `getState()` and `getError()`.** Read the value and error off the unified snapshot instead.

    ```diff
    - const data = store.getState();
    - const error = store.getError();
    + const { data, error } = store.getState();
    ```

    **Removed `retry()`.** Use `connect()`, which always (re)connects regardless of status. Wrap it with a status guard if you need the error-only behavior.

    ```diff
    - store.retry();
    + if (store.getState().status === 'error') store.connect();
    ```

    **Removed the `ReactiveStore` type alias.** Use `ReactiveStreamStore` directly.

    ```diff
    - import type { ReactiveStore } from '@solana/subscribable';
    + import type { ReactiveStreamStore } from '@solana/subscribable';
    ```

### Minor Changes

- [#1612](https://github.com/anza-xyz/kit/pull/1612) [`08777cf`](https://github.com/anza-xyz/kit/commit/08777cfc156c661e519896d31dcb26ccec4daeee) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Add `useAction` — a React hook that bridges any async function into a tracked action with `dispatch` / `dispatchAsync` / `status` / `data` / `error` / `reset` and supersede-on-second-call semantics. Built on `createReactiveActionStore` from `@solana/subscribable`.

    The wrapped function receives a fresh `AbortSignal` per dispatch. `dispatch(...)` is fire-and-forget — it returns `void`, never throws, and is the variant to wire into UI event handlers, with outcomes read off `status` / `data` / `error`. `dispatchAsync(...)` returns a promise for imperative callers that need the resolved value. Calling either again while a prior call is in flight aborts the first; awaiters of a superseded `dispatchAsync` call see a rejection with an `AbortError` filterable via `isAbortError` from `@solana/promises`. `data` from a prior `success` persists through subsequent `running` states for stale-while-revalidate UX; only `reset()` clears it.

    `fn` is held in a ref synced to the latest render's closure, so values it captures (form state, route params, etc.) are always fresh on each new dispatch without the caller needing to maintain a `deps` array. In-flight calls are unaffected — they continue with the closure they captured at dispatch time. Matches the convention used by `useMutation` in TanStack Query and `useWriteContract` in wagmi.

    The shared `ActionResult<TArgs, TResult>` type is also exported so plugin hooks can declare their return shape against it.

- [#1619](https://github.com/anza-xyz/kit/pull/1619) [`fd6bdef`](https://github.com/anza-xyz/kit/commit/fd6bdef9eb65955ff3c3592e3fef01b4260f1ecd) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Add `useRequest` — a React hook for one-shot async reads. Pass either an async function `(signal) => Promise<T>` or a memoized `ReactiveActionSource<T>` (satisfied by `PendingRpcRequest`). The hook fires the call on mount, re-fires whenever the source identity changes, and aborts the in-flight call on cleanup.

    ```tsx
    // `ReactiveActionSource` (e.g. `PendingRpcRequest`):
    const source = useMemo(() => client.rpc.getLatestBlockhash(), [client]);
    const { data, error, refresh } = useRequest(source);

    // Bare async function:
    const fetcher = useCallback(
        (signal: AbortSignal) => fetch(`/api/users/${userId}`, { signal }).then(r => r.json()),
        [userId],
    );
    const { data, error, refresh } = useRequest(fetcher);
    ```

    The result reports `status` as one of `fetching | success | error | disabled`. A request in flight is always `fetching`; inspect `data` and `error` to know what stale content (if any) is available to render alongside a spinner — first attempt has neither, a refresh after a prior outcome carries one or both forward. Pass `null` for the source to gate the request off — useful while inputs aren't yet known. The result then reports `status: 'disabled'`.

    Optional `getAbortSignal: () => AbortSignal` is a factory invoked on every attempt (initial fire + every `refresh()`). Each attempt gets a fresh signal that's composed with the store's internal per-dispatch controller via `AbortSignal.any`. The natural use is per-attempt timeouts: `getAbortSignal: () => AbortSignal.timeout(5_000)` gives every attempt its own 5-second clock that resets on refresh. The factory is held in a ref synced to the latest render, so inline closures are fine — no `useCallback` needed. `refresh()` also accepts an optional `{ abortSignal }` override to replace the factory for one specific attempt.

    The new `RequestResult<T>` and `UseRequestOptions` types are exported alongside the hook so plugin hooks built on top can declare their return shape against them.

- [#1719](https://github.com/anza-xyz/kit/pull/1719) [`3014977`](https://github.com/anza-xyz/kit/commit/30149771475d45b6cfff1c4aacd16c8f7256e256) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Add `useSubscriptionSWR(key, source, options?)` to the `@solana/react/swr` subpath — the SWR-backed counterpart to `useSubscription`. Routes a `ReactiveStreamSource<T>` through SWR's subscription cache (`useSWRSubscription`).

    ```tsx
    import { useSubscriptionSWR } from '@solana/react/swr';

    const { data } = useSubscriptionSWR(['account', address], client.rpcSubscriptions.accountNotifications(address));
    ```

    `data` is the notification exactly as the source emits it. Pass `null` for either `key` or `source` to disable. Options accept SWR's config plus `getAbortSignal` for an abort signal.

- [#1607](https://github.com/anza-xyz/kit/pull/1607) [`e193711`](https://github.com/anza-xyz/kit/commit/e1937110a3eb300e184b10732f82ccfefe9c2a3f) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Add `ClientProvider`, `useClient`, and `useClientCapability` — the Kit client context layer for React.

    `ClientProvider` publishes a caller-owned Kit client to its subtree. Required by `useClient`, `useClientCapability`, and any plugin-specific hook that depends on a client capability — generic primitives like `useAction` work against arbitrary async functions and don't need a provider. The provider accepts both synchronous clients and promise-returning ones — when given a promise (e.g. `createClient().use(asyncPlugin())`), it suspends via the nearest `<Suspense>` boundary until the client resolves. On React 19 it delegates to `React.use(promise)`; on React 18 an internal thrown-promise shim, keyed by promise identity, honours the same contract.

    `useClient<TClient>()` is the basic context accessor. Defaults to the base `Client` shape; callers who know a specific plugin is installed may widen the type via the generic. Throws a new `SolanaError` with code `SOLANA_ERROR__REACT__MISSING_PROVIDER` when called outside a provider.

    `useClientCapability<TClient>({ capability, hookName, providerHint })` runtime-checks that the requested capability (or capabilities) is installed on the client and throws `SOLANA_ERROR__REACT__MISSING_CAPABILITY` — surfacing the calling `hookName` and a `providerHint` — when it isn't. Plugin-hook authors use this to fail loudly at mount instead of letting a missing plugin surface later as `undefined`.

    Two new error codes (`SOLANA_ERROR__REACT__MISSING_PROVIDER`, `SOLANA_ERROR__REACT__MISSING_CAPABILITY`) are reserved in the `[9000000-9000999]` range.

- [#1702](https://github.com/anza-xyz/kit/pull/1702) [`3a92f37`](https://github.com/anza-xyz/kit/commit/3a92f378cc47e936e96e55ce396e1958308f5e6c) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Add `useSubscription` — a React hook for subscription-based live data. Pass a `ReactiveStreamSource<T>` (satisfied by `PendingRpcSubscriptionsRequest`) and the hook opens the subscription on mount, re-opens whenever the source identity changes, and tears it down on unmount.

    ```tsx
    function AccountBalance({ address }: { address: Address }) {
        const client = useClient<ClientWithRpcSubscriptions<AccountNotificationsApi>>();
        const source = useMemo(() => client.rpcSubscriptions.accountNotifications(address), [client, address]);
        const { data, error, reconnect } = useSubscription(source);
        if (error) return <button onClick={reconnect}>Reconnect</button>;
        return <p>{data ? `${data.value.lamports} lamports at slot ${data.context.slot}` : 'Connecting…'}</p>;
    }
    ```

    The result reports `status` as one of `loading | loaded | error | disabled`. `data` is the notification exactly as the source emits it — no unwrapping or reshaping. For RPC subscriptions that emit `SolanaRpcResponse<U>` (account/program/signature), read the inner value at `data.value` and the slot at `data.context.slot`; for raw notifications (slot/logs/root) `data` is the raw shape. Pass `null` for the source to gate the subscription off — useful while inputs aren't yet known. The result then reports `status: 'disabled'`. After a notification arrives, an error transitions to `status: 'error'` while preserving the stale `data`; `reconnect()` returns to `loading` (preserving stale `data` and `error` for stale-while-revalidate) before settling on `loaded` or a fresh `error`.

    Optional `getAbortSignal: () => AbortSignal` is a factory invoked on every connection (initial subscribe + every `reconnect()`). Each connection gets a fresh signal that the underlying store composes with its per-connection controller via `AbortSignal.any`. The natural use is per-connection timeouts: `getAbortSignal: () => AbortSignal.timeout(30_000)` gives every connection its own 30-second clock that resets on reconnect. The factory is held in a ref synced to the latest render, so inline closures are fine — no `useCallback` needed. `reconnect()` also accepts an optional `{ abortSignal }` override to replace the factory for one specific attempt (presence-based: omit to use the factory, `{ abortSignal: signal }` to override, `{ abortSignal: undefined }` to opt out).

    The hook mirrors `useRequest`'s structure exactly: construct the lazy store via `useMemo`, fire `store.connect()` in a `useEffect`, tear down via `store.reset()` in cleanup. Same StrictMode-safe lifecycle, same vocabulary, same per-call signal API. SSR-safe — on the server the connect effect doesn't run, so the store stays `idle` and the hook reports `status: 'loading'`; first client render hydrates from the same paint and commits the connect.

    `SubscriptionResult<T>` and `UseSubscriptionOptions` are exported alongside the hook so plugin hooks built on top can declare their return shape against them.

- [#1713](https://github.com/anza-xyz/kit/pull/1713) [`587ec07`](https://github.com/anza-xyz/kit/commit/587ec070f2742a95871b0ee5d46077ad2738f9cb) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Add `@solana/react/swr` subpath with `useRequestSWR(key, source, options?)` — the SWR-backed counterpart to `useRequest`. Same source shape (`ReactiveActionSource<T>` or `(signal) => Promise<T>`); returns SWR's native `SWRResponse<T>`. Pass `null` for either `key` or `source` to disable. Requires `swr@^2` as an optional peer dependency.

    ```tsx
    import { useRequestSWR } from '@solana/react/swr';

    const { data } = useRequestSWR(['epochInfo'], client.rpc.getEpochInfo());
    ```

    Options accept any `SWRConfiguration` field plus the Kit-only `getAbortSignal: () => AbortSignal` (same option as `useRequest`), which threads a per-attempt signal into the source — typically a timeout via `AbortSignal.timeout()`. Use SWR's `result.mutate()` to re-fire on demand.

- [#1707](https://github.com/anza-xyz/kit/pull/1707) [`da42ff8`](https://github.com/anza-xyz/kit/commit/da42ff802251374c752b54f76f6a32f13fbb18a8) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Add `useTrackedData` — a React hook for an RPC subscription seeded by a one-shot RPC fetch, slot-deduped. The subscription (e.g. `accountNotifications`) is the primary source of live updates; the initial fetch (e.g. `getBalance`, `getAccountInfo`) provides a value to surface as soon as it resolves — typically before the first subscription notification arrives — so the `loading` paint is shorter than subscription-only would give you. Surfaces a unified `{ data, error, refresh, status }` view where `data` is the `SolanaRpcResponse<TItem>` envelope that the underlying kit primitive emits — the primitive's type guarantees the envelope shape, so callers can read `data.value` and `data.context.slot` directly without a runtime check. The underlying store slot-dedupes between the two sources — out-of-order arrivals never regress the surfaced value (older slots are dropped silently, so a stale RPC response can't overwrite a fresher subscription notification).

    ```tsx
    function AccountBalance({ address }: { address: Address }) {
        const client = useClient<ClientWithRpc<GetBalanceApi> & ClientWithRpcSubscriptions<AccountNotificationsApi>>();
        const spec = useMemo(
            () => ({
                rpcRequest: client.rpc.getBalance(address),
                rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address),
                rpcValueMapper: (lamports: bigint) => lamports,
                rpcSubscriptionValueMapper: ({ lamports }: { lamports: bigint }) => lamports,
            }),
            [client, address],
        );
        const { data, error, refresh } = useTrackedData(spec);
        if (error) return <button onClick={refresh}>Retry</button>;
        return <p>{data ? `${data.value} lamports at slot ${data.context.slot}` : 'Loading…'}</p>;
    }
    ```

    The result reports `status` as one of `loading | loaded | error | disabled`. Pass `null` for the spec to gate the work off — useful while inputs aren't yet known (e.g. an `address` that hasn't been selected). After a notification arrives, an error transitions to `status: 'error'` while preserving the stale `data` (envelope intact); `refresh()` re-runs both the initial RPC and the subscription, returns `status` to `loading` (preserving stale `data` and `error` for stale-while-revalidate), and settles on `loaded` or a fresh `error`.

    Optional `getAbortSignal: () => AbortSignal` is a factory invoked on every attempt (initial run + every `refresh()`). Each attempt gets a fresh signal that the underlying store composes with its per-attempt controller via `AbortSignal.any`. The natural use is per-attempt timeouts: `getAbortSignal: () => AbortSignal.timeout(30_000)` gives every attempt its own 30-second clock that resets on refresh. The factory is held in a ref synced to the latest render, so inline closures are fine — no `useCallback` needed. `refresh()` also accepts an optional `{ abortSignal }` override to replace the factory for one specific attempt (presence-based: omit to use the factory, `{ abortSignal: signal }` to override, `{ abortSignal: undefined }` to opt out).

    The hook is built on `createReactiveStoreWithInitialValueAndSlotTracking` from `@solana/kit` — the slot tracking, abort plumbing, and stale-while-revalidate behaviour live one layer down. The React surface reduces to `useSyncExternalStore` glue plus the per-attempt signal API. The Kit primitive's config type is re-shaped as `TrackedDataSpec<TRpcValue, TSubscriptionValue, TItem>` for friendlier use-site naming; the two are mutually assignable. SSR-safe — on the server the connect effect doesn't run, so the store stays `idle` and the hook reports `status: 'loading'`; first client render hydrates from the same paint and commits the connect.

    `TrackedDataResult<T>`, `TrackedDataSpec<TRpc, TSub, T>`, and `UseTrackedDataOptions` are exported alongside the hook for plugin hooks built on top.

- [#1727](https://github.com/anza-xyz/kit/pull/1727) [`c32a0f7`](https://github.com/anza-xyz/kit/commit/c32a0f72ea1c264e4f0936a59aa47d2512314f92) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Add `useTrackedDataSWR(key, spec, options?)` to the `@solana/react/swr` subpath — the SWR-backed counterpart to `useTrackedData`. Takes the same `TrackedDataSpec` and routes the unified, slot-deduped stream through SWR's `useSWRSubscription`.

    ```tsx
    import { useTrackedDataSWR } from '@solana/react/swr';

    const { data } = useTrackedDataSWR(['balance', address], spec);
    // data is `SolanaRpcResponse<TItem> | undefined`
    ```

    `data` is shape `SolanaRpcResponse<TItem>`, because this hook requires the slot for de-duping. Mirrors core `useTrackedData`. Pass `null` for either `key` or `spec` to disable. Options accept SWR's config plus `getAbortSignal` for a custom abort signal.

- [#1769](https://github.com/anza-xyz/kit/pull/1769) [`205af00`](https://github.com/anza-xyz/kit/commit/205af001328d8e209c9cb99dad846748fa88077b) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Add `useTrackedDataQuery` to the `@solana/react/query` subpath. This is the TanStack Query-backed counterpart to `useTrackedData`: it pairs a one-shot RPC fetch with an ongoing subscription (slot-deduped) and routes the unified stream through TanStack Query's cache via `experimental_streamedQuery`, surfacing the `SolanaRpcResponse<TItem>` envelope as `data`. Slot dedupe spans the cache, so a `refetch()`'s fresh store cannot regress the cached envelope to an older slot from a lagging RPC node.

- [#1759](https://github.com/anza-xyz/kit/pull/1759) [`1032a79`](https://github.com/anza-xyz/kit/commit/1032a79046cf4e7a7f8b983ac9c05aaede6814d3) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Add a `@solana/react/query` subpath that bridges Kit's reactive primitives into [TanStack Query](https://tanstack.com/query). The new `useRequestQuery(key, source, options?)` hook is the TanStack Query-backed counterpart to `useRequest` — it accepts the same `ReactiveActionSource<T>` or `(signal: AbortSignal) => Promise<T>` source shape, routes it through TanStack's cache, and threads the query's cancellation signal (combined with the optional `getAbortSignal` factory) into the source. Pass a `null` source to disable the query (mapped to TanStack's `enabled: false`). `@tanstack/react-query@^5` is an optional peer dependency.

- [#1760](https://github.com/anza-xyz/kit/pull/1760) [`251b361`](https://github.com/anza-xyz/kit/commit/251b3611700b37a96b4ff16f8818fb486c58bf87) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Add `useSubscriptionQuery(key, source, options?)` to the `@solana/react/query` subpath — the TanStack Query-backed counterpart to `useSubscription`, for streams with no one-shot RPC fetch. It routes a long-lived stream through TanStack Query's cache via `experimental_streamedQuery`, so components reading the same `key` share one connection and the stream shows up in TanStack Query's devtools.

    ```tsx
    import { useSubscriptionQuery } from '@solana/react/query';

    const { data, error } = useSubscriptionQuery(['slot'], client.rpcSubscriptions.slotNotifications());
    ```

    The source matches `useSubscription`: a `ReactiveStreamSource<T>`. The hook also accepts a raw `(signal: AbortSignal) => AsyncIterable<T>` factory, as `experimental_streamedQuery` is built on `AsyncIterable`. `data` is the raw notification — the `SolanaRpcResponse` envelope is not unwrapped — matching `useSubscription`. Pass `null` for `source` to disable (TanStack's `enabled: false`); call `result.refetch()` to reconnect. Defaults `retry: false`, `staleTime: Infinity`, and `refetchOnWindowFocus: false` so a focus revalidation doesn't tear down and re-open the connection.

- [#1624](https://github.com/anza-xyz/kit/pull/1624) [`1c8d215`](https://github.com/anza-xyz/kit/commit/1c8d215afaa795f981999a5d8c6f21e9effb1db6) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Preserve the last `error` on a `ReactiveActionStore` through subsequent `running` states, matching the existing stale-while-revalidate behavior for `data`. A re-dispatch after a failure now keeps the previous error visible until the new attempt resolves, mirroring how SWR and TanStack Query handle revalidation. `success` clears the error; `reset()` clears both. This also affects `useAction`, whose `error` field now persists through a new `dispatch()` until the new call resolves.

### Patch Changes

- [#1719](https://github.com/anza-xyz/kit/pull/1719) [`3014977`](https://github.com/anza-xyz/kit/commit/30149771475d45b6cfff1c4aacd16c8f7256e256) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Add the `SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR` error code. `useSubscriptionSWR` now surfaces this `SolanaError` when the underlying store reaches an error state without an error value (e.g. a `DataPublisher` emitting `undefined` on its error channel, or `controller.abort(null)`), instead of passing the nullish value to SWR's `next` — which would be treated as a success and silently wipe the cached data.

- [#1706](https://github.com/anza-xyz/kit/pull/1706) [`9063658`](https://github.com/anza-xyz/kit/commit/906365844fdc8555850ea9c8d1fc84614e6883ca) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Migrate `@solana/react` to depend on `@solana/kit` as a peer dependency (replacing its individual workspace sub-package deps) and re-export `@solana/subscribable` from `@solana/kit` so React consumers have a single import root. `@solana/promises` remains as a direct dep — it's a small utility that isn't part of Kit's public surface.

    For `@solana/react` users:
    - `@solana/kit` must now be installed alongside `@solana/react`.
    - Apps that already use both get a single deduplicated `@solana/kit` instance — important for anything relying on shared types or `instanceof SolanaError` checks.
    - Kit can be bumped independently of React within the peer range.

    For `@solana/kit` users:
    - `ReactiveStreamSource`, `ReactiveStreamStore`, `ReactiveActionSource`, `ReactiveActionStore`, `ReactiveState`, `createReactiveActionStore`, `createReactiveStoreFromDataPublisherFactory`, `DataPublisher` and the rest of `@solana/subscribable`'s surface are now reachable directly through `@solana/kit`.

- Updated dependencies [[`d09718d`](https://github.com/anza-xyz/kit/commit/d09718de4e2644c8d2a29d4e2d8992bc06177510), [`fa04323`](https://github.com/anza-xyz/kit/commit/fa043235a58d928a30b7a66a56643dec5327dd6a), [`3de3dda`](https://github.com/anza-xyz/kit/commit/3de3dda437c18be882cd6378bebda7a82a54e5b0), [`772b82c`](https://github.com/anza-xyz/kit/commit/772b82c4f18c418100560a5010b17e6b40dd7ab3), [`03000e5`](https://github.com/anza-xyz/kit/commit/03000e57cf90a1dab630704edf067bc2ac3bc381), [`a4ef3b5`](https://github.com/anza-xyz/kit/commit/a4ef3b5f6c3735d015d6f08898372bd648f36c67), [`a198b5c`](https://github.com/anza-xyz/kit/commit/a198b5c6c9681b3f9c37d9d458cbc6b87b7667e7), [`9063658`](https://github.com/anza-xyz/kit/commit/906365844fdc8555850ea9c8d1fc84614e6883ca), [`6947740`](https://github.com/anza-xyz/kit/commit/6947740680b1bb8c570a5c513ba165e356ceee7d), [`1c8d215`](https://github.com/anza-xyz/kit/commit/1c8d215afaa795f981999a5d8c6f21e9effb1db6), [`acec0be`](https://github.com/anza-xyz/kit/commit/acec0be468340a7367f78fe8a8ed61ed8a16e553)]:
    - @solana/subscribable@7.0.0
    - @solana/kit@7.0.0
    - @solana/signers@7.0.0
    - @solana/transaction-messages@7.0.0
    - @solana/transactions@7.0.0
    - @solana/promises@7.0.0

## 6.10.0

### Patch Changes

- Updated dependencies [[`c318d7f`](https://github.com/anza-xyz/kit/commit/c318d7f2e16fec92859503af41102792be01cece), [`460557b`](https://github.com/anza-xyz/kit/commit/460557b9f706f22aa384cb175deeb45c30081166), [`40e0848`](https://github.com/anza-xyz/kit/commit/40e084878ca49f37f38065c8b2f64f1b62454f36), [`47a785b`](https://github.com/anza-xyz/kit/commit/47a785bdb47f89443cccb69151650974d0f57f65), [`6b499ee`](https://github.com/anza-xyz/kit/commit/6b499ee38a3f695951a8505f23964839fd308b3d), [`74b8d3d`](https://github.com/anza-xyz/kit/commit/74b8d3d5166b4857ab722eae0ec5e2843e480a4b)]:
    - @solana/errors@6.10.0
    - @solana/addresses@6.10.0
    - @solana/keys@6.10.0
    - @solana/signers@6.10.0
    - @solana/transaction-messages@6.10.0
    - @solana/transactions@6.10.0
    - @solana/promises@6.10.0

## 6.9.0

### Patch Changes

- Updated dependencies [[`8d73de5`](https://github.com/anza-xyz/kit/commit/8d73de5241d709946431f2fdda74f2a0df5e9529), [`92126f4`](https://github.com/anza-xyz/kit/commit/92126f438afff8b7521f827cf0e92b1d2cd69c55), [`a5ef97b`](https://github.com/anza-xyz/kit/commit/a5ef97b17fe747de1e2bee0189ed44e20c0f6c40), [`e82e03e`](https://github.com/anza-xyz/kit/commit/e82e03eb0e982db74f96d11b9aa8fefb4f0038c3), [`096c48e`](https://github.com/anza-xyz/kit/commit/096c48e6771ad7ea833cb4ca51206b7cc827a3d7)]:
    - @solana/promises@6.9.0
    - @solana/errors@6.9.0
    - @solana/addresses@6.9.0
    - @solana/keys@6.9.0
    - @solana/signers@6.9.0
    - @solana/transaction-messages@6.9.0
    - @solana/transactions@6.9.0

## 6.8.0

### Patch Changes

- Updated dependencies [[`d79f8d1`](https://github.com/anza-xyz/kit/commit/d79f8d115065557194db9604f3a0bfef7d37a2b6), [`667a0f0`](https://github.com/anza-xyz/kit/commit/667a0f059f5432244ab2cf8a23a22f53c7a36b4b), [`fdfcb6c`](https://github.com/anza-xyz/kit/commit/fdfcb6cbf439eb55e07ad7d59372347bd816d6d3), [`43bc570`](https://github.com/anza-xyz/kit/commit/43bc570a5b51a9fda75abc1f0f818728ca3cd439), [`ffb7665`](https://github.com/anza-xyz/kit/commit/ffb76652f6b887eb5020c3584f1d827a1098dccc)]:
    - @solana/signers@6.8.0
    - @solana/keys@6.8.0
    - @solana/addresses@6.8.0
    - @solana/errors@6.8.0
    - @solana/promises@6.8.0
    - @solana/transaction-messages@6.8.0
    - @solana/transactions@6.8.0

## 6.7.0

### Patch Changes

- Updated dependencies []:
    - @solana/addresses@6.7.0
    - @solana/errors@6.7.0
    - @solana/keys@6.7.0
    - @solana/promises@6.7.0
    - @solana/signers@6.7.0
    - @solana/transaction-messages@6.7.0
    - @solana/transactions@6.7.0

## 6.6.0

### Patch Changes

- Updated dependencies [[`742ffca`](https://github.com/anza-xyz/kit/commit/742ffcaf5304f702334e1f0b2a14cf208ae0ee5f), [`7f02d23`](https://github.com/anza-xyz/kit/commit/7f02d23948cc09e3f0bc70931d845569f1cb38ad), [`0fa54a4`](https://github.com/anza-xyz/kit/commit/0fa54a469937db3989f42afc4248882736f719f5)]:
    - @solana/transactions@6.6.0
    - @solana/errors@6.6.0
    - @solana/transaction-messages@6.6.0
    - @solana/signers@6.6.0
    - @solana/addresses@6.6.0
    - @solana/keys@6.6.0
    - @solana/promises@6.6.0

## 6.5.0

### Patch Changes

- Updated dependencies [[`9e05736`](https://github.com/anza-xyz/kit/commit/9e057365a1a4e350f8a0ccc233b262e09b0134fa)]:
    - @solana/signers@6.5.0
    - @solana/addresses@6.5.0
    - @solana/errors@6.5.0
    - @solana/keys@6.5.0
    - @solana/promises@6.5.0
    - @solana/transaction-messages@6.5.0
    - @solana/transactions@6.5.0

## 6.4.0

### Patch Changes

- Updated dependencies [[`084e92e`](https://github.com/anza-xyz/kit/commit/084e92e668d41041c6424d616441557560873888)]:
    - @solana/transaction-messages@6.4.0
    - @solana/addresses@6.4.0
    - @solana/keys@6.4.0
    - @solana/signers@6.4.0
    - @solana/transactions@6.4.0
    - @solana/errors@6.4.0
    - @solana/promises@6.4.0

## 6.3.1

### Patch Changes

- Updated dependencies []:
    - @solana/addresses@6.3.1
    - @solana/errors@6.3.1
    - @solana/keys@6.3.1
    - @solana/promises@6.3.1
    - @solana/signers@6.3.1
    - @solana/transaction-messages@6.3.1
    - @solana/transactions@6.3.1

## 6.3.0

### Patch Changes

- Updated dependencies [[`f47d5cf`](https://github.com/anza-xyz/kit/commit/f47d5cf30512bbae3233f0ddccae45462af7f309)]:
    - @solana/errors@6.3.0
    - @solana/addresses@6.3.0
    - @solana/keys@6.3.0
    - @solana/signers@6.3.0
    - @solana/transaction-messages@6.3.0
    - @solana/transactions@6.3.0
    - @solana/promises@6.3.0

## 6.2.0

### Patch Changes

- Updated dependencies [[`0d0be3e`](https://github.com/anza-xyz/kit/commit/0d0be3e18bfbb053b92c4b2d338c5bb0ed414bcc), [`7568a12`](https://github.com/anza-xyz/kit/commit/7568a127e1d1197d2362be464117bc41c82b01ad), [`e33a65f`](https://github.com/anza-xyz/kit/commit/e33a65fd18d52bd2d7a0018ff9a152ff6f43a3b3), [`49c1195`](https://github.com/anza-xyz/kit/commit/49c1195637a8d550b864918e96d9f9681f658bfe)]:
    - @solana/errors@6.2.0
    - @solana/addresses@6.2.0
    - @solana/keys@6.2.0
    - @solana/signers@6.2.0
    - @solana/transaction-messages@6.2.0
    - @solana/transactions@6.2.0
    - @solana/promises@6.2.0

## 6.1.0

### Patch Changes

- Updated dependencies [[`3f711e1`](https://github.com/anza-xyz/kit/commit/3f711e16bc38657d5d1ff71cf98e73897ff19ea5), [`215027c`](https://github.com/anza-xyz/kit/commit/215027c49845bd5cbd86d3da396f0c3895283d75)]:
    - @solana/errors@6.1.0
    - @solana/transaction-messages@6.1.0
    - @solana/transactions@6.1.0
    - @solana/addresses@6.1.0
    - @solana/keys@6.1.0
    - @solana/signers@6.1.0
    - @solana/promises@6.1.0

## 6.0.1

### Patch Changes

- Updated dependencies [[`2d3296f`](https://github.com/anza-xyz/kit/commit/2d3296f1ea03184455197d0284be73ada999b492), [`a8a57ce`](https://github.com/anza-xyz/kit/commit/a8a57cebc47caa24f6d105c346427baa244fa462)]:
    - @solana/transaction-messages@6.0.1
    - @solana/signers@6.0.1
    - @solana/transactions@6.0.1
    - @solana/addresses@6.0.1
    - @solana/errors@6.0.1
    - @solana/keys@6.0.1
    - @solana/promises@6.0.1

## 6.0.0

### Patch Changes

- Updated dependencies [[`f80b6de`](https://github.com/anza-xyz/kit/commit/f80b6de0649ed2df3aa64fdd01215322bb8cc926), [`b82df4c`](https://github.com/anza-xyz/kit/commit/b82df4c98a9f157c030f62735f4427ba095bee6a), [`986a09c`](https://github.com/anza-xyz/kit/commit/986a09c56c38c2a91752972ec258fe790f8620db)]:
    - @solana/transaction-messages@6.0.0
    - @solana/signers@6.0.0
    - @solana/transactions@6.0.0
    - @solana/addresses@6.0.0
    - @solana/errors@6.0.0
    - @solana/keys@6.0.0
    - @solana/promises@6.0.0

## 5.5.1

### Patch Changes

- Updated dependencies [[`d957526`](https://github.com/anza-xyz/kit/commit/d9575263c3e563c6951cd35bbc6e65e70a0e6a10)]:
    - @solana/errors@5.5.1
    - @solana/addresses@5.5.1
    - @solana/keys@5.5.1
    - @solana/signers@5.5.1
    - @solana/transaction-messages@5.5.1
    - @solana/transactions@5.5.1
    - @solana/promises@5.5.1

## 5.5.0

### Patch Changes

- [#1210](https://github.com/anza-xyz/kit/pull/1210) [`56433e9`](https://github.com/anza-xyz/kit/commit/56433e9c87ddb3f6aeb7bb4dd029db86785341cb) Thanks [@rajgoesout](https://github.com/rajgoesout)! - Return immediately when passing empty array of transactions to `useSignTransactions` and `useSignAndSendTransactions`

- Updated dependencies [[`b4f5897`](https://github.com/anza-xyz/kit/commit/b4f5897cab50a92f50b6b390ae76d743173c26dd), [`08c9062`](https://github.com/anza-xyz/kit/commit/08c906299409e82a5941e1044fc6d47d633df784), [`ba3f186`](https://github.com/anza-xyz/kit/commit/ba3f1861a9cb53b4c0e7c6d1b92791d8983e001b), [`1cc0a31`](https://github.com/anza-xyz/kit/commit/1cc0a3163cf884a715aef5ba336adfd980dabfa6), [`6af7c15`](https://github.com/anza-xyz/kit/commit/6af7c156a9cd196d0d5ecb374fe696ec659756bf)]:
    - @solana/errors@5.5.0
    - @solana/addresses@5.5.0
    - @solana/keys@5.5.0
    - @solana/signers@5.5.0
    - @solana/transaction-messages@5.5.0
    - @solana/transactions@5.5.0
    - @solana/promises@5.5.0

## 5.4.0

### Minor Changes

- [#1154](https://github.com/anza-xyz/kit/pull/1154) [`fec04ae`](https://github.com/anza-xyz/kit/commit/fec04ae9cd0939c556b832e20440d27c4574561a) Thanks [@ningthoujamSwamikumar](https://github.com/ningthoujamSwamikumar)! - Add a context provider `<SelectedWalletAccountContext>` and `useSelectedWalletAccount` to persist a selected wallet account

- [#1105](https://github.com/anza-xyz/kit/pull/1105) [`a301da8`](https://github.com/anza-xyz/kit/commit/a301da85ec21901fd1836d784ba46cc1d8ddddc2) Thanks [@rajgoesout](https://github.com/rajgoesout)! - Add `useSignTransactions` and `useSignAndSendTransactions` hooks that you can use to send multiple transactions to a connected wallet.

### Patch Changes

- [#1199](https://github.com/anza-xyz/kit/pull/1199) [`9bde4d7`](https://github.com/anza-xyz/kit/commit/9bde4d74f8d338495112ff00519177857b78884f) Thanks [@rajgoesout](https://github.com/rajgoesout)! - Correct featureName in `signTransaction` error

- Updated dependencies [[`f5f89eb`](https://github.com/anza-xyz/kit/commit/f5f89eb8e769d5b6056b2f686d51a7ef4a0d1d09), [`189de37`](https://github.com/anza-xyz/kit/commit/189de37f76bcb273986d750fd6ed6541f711103b)]:
    - @solana/transaction-messages@5.4.0
    - @solana/transactions@5.4.0
    - @solana/addresses@5.4.0
    - @solana/promises@5.4.0
    - @solana/signers@5.4.0
    - @solana/errors@5.4.0
    - @solana/keys@5.4.0

## 5.3.0

### Patch Changes

- Updated dependencies []:
    - @solana/addresses@5.3.0
    - @solana/errors@5.3.0
    - @solana/keys@5.3.0
    - @solana/promises@5.3.0
    - @solana/signers@5.3.0
    - @solana/transaction-messages@5.3.0
    - @solana/transactions@5.3.0

## 5.2.0

### Patch Changes

- Updated dependencies [[`b80b092`](https://github.com/anza-xyz/kit/commit/b80b09239762262116cb70b43271ad98a2f716b5), [`109c78e`](https://github.com/anza-xyz/kit/commit/109c78e8972857323558ca913706a95cdb70c549), [`6dbaf66`](https://github.com/anza-xyz/kit/commit/6dbaf66015198bd912ec0800c1db1fd63b68e7a2)]:
    - @solana/errors@5.2.0
    - @solana/keys@5.2.0
    - @solana/transaction-messages@5.2.0
    - @solana/transactions@5.2.0
    - @solana/signers@5.2.0
    - @solana/addresses@5.2.0
    - @solana/promises@5.2.0

## 5.1.0

### Patch Changes

- [#1040](https://github.com/anza-xyz/kit/pull/1040) [`32b13a8`](https://github.com/anza-xyz/kit/commit/32b13a8973fe0645af1f87f0068c289730b4062c) Thanks [@OrmEmbaar](https://github.com/OrmEmbaar)! - Add a function called bytesEqual to codecs-core that you can use to compare two byte arrays for equality.

- Updated dependencies [[`becf5f6`](https://github.com/anza-xyz/kit/commit/becf5f63f1b97d43109b2488c7cd0806ce6329f4), [`32214f5`](https://github.com/anza-xyz/kit/commit/32214f57cfb79fb2566e773acec71635bac641df), [`32b13a8`](https://github.com/anza-xyz/kit/commit/32b13a8973fe0645af1f87f0068c289730b4062c), [`2f7bda8`](https://github.com/anza-xyz/kit/commit/2f7bda81ca8248797957bdf693e812abc90b1951), [`81a0eec`](https://github.com/anza-xyz/kit/commit/81a0eec57d196d4ce6b86897640dcab85c5deafd)]:
    - @solana/errors@5.1.0
    - @solana/addresses@5.1.0
    - @solana/transactions@5.1.0
    - @solana/transaction-messages@5.1.0
    - @solana/signers@5.1.0
    - @solana/keys@5.1.0
    - @solana/promises@5.1.0

## 5.0.0

### Patch Changes

- Updated dependencies [[`0fed638`](https://github.com/anza-xyz/kit/commit/0fed6389886639a48b44a09e129ac1b264c44389)]:
    - @solana/errors@5.0.0
    - @solana/signers@5.0.0
    - @solana/transaction-messages@5.0.0
    - @solana/transactions@5.0.0
    - @solana/addresses@5.0.0
    - @solana/keys@5.0.0
    - @solana/promises@5.0.0

## 4.0.0

### Major Changes

- [#927](https://github.com/anza-xyz/kit/pull/927) [`c035ab8`](https://github.com/anza-xyz/kit/commit/c035ab8a488486d160ca0361408493115cd09383) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Update the signer API to return Transaction & TransactionWithLifetime

    The `modifyAndSignTransactions` function for a `TransactionModifyingSigner` must now return a `Transaction & TransactionWithLifetime & TransactionWithinSizeLimit`. Previously it technically needed to return a type derived from the input `TransactionMessage`, but this wasn't checked.

    If you have written a `TransactionModifyingSigner` then you should review the changes to `useWalletAccountTransactionSigner` in the React package for guidance. You may need to use the new `getTransactionLifetimeConstraintFromCompiledTransactionMessage` function to obtain a lifetime for the transaction being returned.

    If you are using a `TransactionModifyingSigner` such as `useWalletAccountTransactionSigner`, then you will now receive a transaction with `TransactionWithLifetime` when you would previously have received a type with a lifetime matching the input transaction message. This was never guaranteed to match at runtime, but we incorrectly returned a stronger type than can be guaranteed. You may need to use the new `isTransactionWithBlockhashLifetime` or `isTransactionWithDurableNonceLifetime` functions to check the lifetime type of the returned transaction. For example, if you want to pass it to a function returned by `sendAndConfirmTransactionFactory` then you must use `isTransactionWithBlockhashLifetime` or `assertIsTransactionWithBlockhashLifetime` to check its lifetime first.

### Patch Changes

- [#919](https://github.com/anza-xyz/kit/pull/919) [`c87cada`](https://github.com/anza-xyz/kit/commit/c87cada3ddf0a8c5fa27ed7122b901b17392c2df) Thanks [@mcintyre94](https://github.com/mcintyre94)! - Update useWalletAccountTransactionSigner to return a LifetimeConstraint for the updated transaction

- Updated dependencies [[`5408f52`](https://github.com/anza-xyz/kit/commit/5408f524ae22293cb7b497310440019be5a98c55), [`f591dea`](https://github.com/anza-xyz/kit/commit/f591dead4a3d5871fd02460f6301bb4bdf6b508e), [`cb11699`](https://github.com/anza-xyz/kit/commit/cb11699d77536e5901c62d32e43c671b044e4aa1), [`9fa8465`](https://github.com/anza-xyz/kit/commit/9fa8465bf0f264f5a9181c805a0d85cb1ecc2768), [`af01f27`](https://github.com/anza-xyz/kit/commit/af01f2770e4b3a94f3ef3360677b27aa08175c1b), [`c035ab8`](https://github.com/anza-xyz/kit/commit/c035ab8a488486d160ca0361408493115cd09383), [`22f18d0`](https://github.com/anza-xyz/kit/commit/22f18d0ce8950b26eaa897b146bfe8c1a025b3bb), [`c87cada`](https://github.com/anza-xyz/kit/commit/c87cada3ddf0a8c5fa27ed7122b901b17392c2df), [`54d8445`](https://github.com/anza-xyz/kit/commit/54d8445bbef207b6d84da0ea91a1c091251ee013)]:
    - @solana/transactions@4.0.0
    - @solana/errors@4.0.0
    - @solana/keys@4.0.0
    - @solana/transaction-messages@4.0.0
    - @solana/signers@4.0.0
    - @solana/addresses@4.0.0
    - @solana/promises@4.0.0

## 3.0.0

### Patch Changes

- Updated dependencies [[`93ae6f9`](https://github.com/anza-xyz/kit/commit/93ae6f96859019b6c7ea9a596ffb9b1be7a35e64), [`6a183bf`](https://github.com/anza-xyz/kit/commit/6a183bf9e9d672e2d42f3aecc589a9e54d01cb1a), [`760fb83`](https://github.com/anza-xyz/kit/commit/760fb8319f6b53fa1baf05f9aa1246cb6c2caceb), [`23d2fa1`](https://github.com/anza-xyz/kit/commit/23d2fa14cbd5197473eca94a1ac6c5abf221b052), [`771f8ae`](https://github.com/anza-xyz/kit/commit/771f8aef1f8c096450c6e4ac05b8611150201485), [`a894d53`](https://github.com/anza-xyz/kit/commit/a894d53192d50b5d2217ada2cb715d71ef4f8f02), [`9feba85`](https://github.com/anza-xyz/kit/commit/9feba8557b64dd3199cd88af2c17b7ccd5d18fec), [`00d66fb`](https://github.com/anza-xyz/kit/commit/00d66fbec15288bb531f7459b6baa48aead1cdc6), [`01f159a`](https://github.com/anza-xyz/kit/commit/01f159a436d7a29479aa1a1877c9b4c77da1170f), [`0bd053b`](https://github.com/anza-xyz/kit/commit/0bd053bfa40b095d37bea7b7cd695259ba5a9cdc), [`55d6b04`](https://github.com/anza-xyz/kit/commit/55d6b040764f5e32de9c94d1844529855233d845), [`a74ea02`](https://github.com/anza-xyz/kit/commit/a74ea0267bf589fba50bb2ebe72dc4f73da9adcf), [`771f8ae`](https://github.com/anza-xyz/kit/commit/771f8aef1f8c096450c6e4ac05b8611150201485)]:
    - @solana/signers@3.0.0
    - @solana/errors@3.0.0
    - @solana/transactions@3.0.0
    - @solana/addresses@3.0.0
    - @solana/keys@3.0.0
    - @solana/promises@3.0.0

## 2.3.0

### Patch Changes

- Updated dependencies [[`6ccbf01`](https://github.com/anza-xyz/kit/commit/6ccbf012703fce1cb40388b0f4e1ffaeffea838a), [`363e3cc`](https://github.com/anza-xyz/kit/commit/363e3cc45db77a731bab1435b925fe0ad0af01df), [`eeac21d`](https://github.com/anza-xyz/kit/commit/eeac21d5fe4d8fb3ed3addee87872679ee37b4c4), [`bbcb913`](https://github.com/anza-xyz/kit/commit/bbcb913839d33abc746f38d6e65e7bfd30cd2ac6), [`93609aa`](https://github.com/anza-xyz/kit/commit/93609aa31dbd83086d0debd41aa2f8e9a0809761), [`b7dfe03`](https://github.com/anza-xyz/kit/commit/b7dfe033a8e929d7a598d8bfea546e9ef4207639), [`810d6ab`](https://github.com/anza-xyz/kit/commit/810d6abafe1b7ea46ed63c491db1f5d6c16397ab)]:
    - @solana/transactions@2.3.0
    - @solana/signers@2.3.0
    - @solana/errors@2.3.0
    - @solana/addresses@2.3.0
    - @solana/keys@2.3.0
    - @solana/promises@2.3.0

## 2.2.1

### Patch Changes

- Updated dependencies []:
    - @solana/addresses@2.2.1
    - @solana/errors@2.2.1
    - @solana/keys@2.2.1
    - @solana/promises@2.2.1
    - @solana/signers@2.2.1
    - @solana/transactions@2.2.1

## 2.2.0

### Patch Changes

- Updated dependencies [[`85925d6`](https://github.com/anza-xyz/kit/commit/85925d64308e91b59fb748c75e4b414012eb4893)]:
    - @solana/addresses@2.2.0
    - @solana/keys@2.2.0
    - @solana/signers@2.2.0
    - @solana/transactions@2.2.0
    - @solana/errors@2.2.0
    - @solana/promises@2.2.0

## 2.1.1

### Patch Changes

- [#473](https://github.com/anza-xyz/kit/pull/473) [`36a9dee`](https://github.com/anza-xyz/kit/commit/36a9dee4e6cbd72020dc74777fe394130b9a5f46) Thanks [@steveluscher](https://github.com/steveluscher)! - The identity of all branded types has changed in such a way that the types from v2.1.1 will be compatible with any other version going forward, which is not the case for versions v2.1.0 and before.

    If you end up with a mix of versions in your project prior to v2.1.1 (eg. `@solana/addresses@2.0.0` and `@solana/addresses@2.1.0`) you may discover that branded types like `Address` raise a type error, even though they are runtime compatible. Your options are:
    1. Always make sure that you have exactly one instance of each `@solana/*` dependency in your project at any given time
    2. Upgrade all of your `@solana/*` dependencies to v2.1.1 at minimum, even if their minor or patch versions differ.
    3. Suppress the type errors using a comment like the following:
        ```ts
        const myAddress = address('1234..5678'); // from @solana/addresses@2.0.0
        const myAccount = await fetchEncodedAccount(
            // imports @solana/addresses@2.1.0
            rpc,
            // @ts-expect-error Address types mismatch between installed versions of @solana/addresses
            myAddress,
        );
        ```

- Updated dependencies [[`36a9dee`](https://github.com/anza-xyz/kit/commit/36a9dee4e6cbd72020dc74777fe394130b9a5f46), [`ca1d4ec`](https://github.com/anza-xyz/kit/commit/ca1d4ec7ddd641ca813f79f8ca06d225f29419e2)]:
    - @solana/transactions@2.1.1
    - @solana/addresses@2.1.1
    - @solana/promises@2.1.1
    - @solana/signers@2.1.1
    - @solana/errors@2.1.1
    - @solana/keys@2.1.1

## 2.1.0

### Patch Changes

- [`1adf435`](https://github.com/anza-xyz/kit/commit/1adf435cfc724303f64e509a6fda144ec8f5019d) Thanks [@leantOnSol](https://github.com/leantOnSol)! - A two-versions-old version of Node LTS is now specified everywhere via the `engines` field, including the one in the root of the `pnpm` workspace, and engine-strictness is delegated to the `.npmrc` files.

- Updated dependencies [[`a1e45a1`](https://github.com/anza-xyz/kit/commit/a1e45a1d91ba1ac530eea0986b2ffeafb9713aec), [`1adf435`](https://github.com/anza-xyz/kit/commit/1adf435cfc724303f64e509a6fda144ec8f5019d), [`d1c787c`](https://github.com/anza-xyz/kit/commit/d1c787c447bd134e6a6da8be059c8353f92b2f9a), [`0c577eb`](https://github.com/anza-xyz/kit/commit/0c577eb03fa5db8b817f209d52a19a36976c7c12), [`c7b7dd9`](https://github.com/anza-xyz/kit/commit/c7b7dd99aca878d2450760c214dbea593ddbadc0), [`5af7f20`](https://github.com/anza-xyz/kit/commit/5af7f2013135a79893a0f190a905c6dd077ac38c), [`704d8a2`](https://github.com/anza-xyz/kit/commit/704d8a220592a5a472bd7726013814b50c991f5b)]:
    - @solana/signers@2.1.0
    - @solana/addresses@2.1.0
    - @solana/errors@2.1.0
    - @solana/keys@2.1.0
    - @solana/transactions@2.1.0
    - @solana/promises@2.1.0

## 2.0.0

### Minor Changes

- [#2928](https://github.com/solana-labs/solana-web3.js/pull/2928) [`bac3747`](https://github.com/solana-labs/solana-web3.js/commit/bac37479dcfad3da86ccd01da5095759f449eb3d) Thanks [@steveluscher](https://github.com/steveluscher)! - Added a `useSignIn` hook that, given a `UiWallet` or `UiWalletAccount`, returns a function that you can call to trigger a wallet's [&lsquo;Sign In With Solana&rsquo;](https://phantom.app/learn/developers/sign-in-with-solana) feature.

    #### Example

    ```tsx
    import { useSignIn } from '@solana/react';

    function SignInButton({ wallet }) {
        const csrfToken = useCsrfToken();
        const signIn = useSignIn(wallet);
        return (
            <button
                onClick={async () => {
                    try {
                        const { account, signedMessage, signature } = await signIn({
                            requestId: csrfToken,
                        });
                        // Authenticate the user, typically on the server, by verifying that
                        // `signedMessage` was signed by the person who holds the private key for
                        // `account.publicKey`.
                        //
                        // Authorize the user, also on the server, by decoding `signedMessage` as the
                        // text of a Sign In With Solana message, verifying that it was not modified
                        // from the values your application expects, and that its content is sufficient
                        // to grant them access.
                        window.alert(`You are now signed in with the address ${account.address}`);
                    } catch (e) {
                        console.error('Failed to sign in', e);
                    }
                }}
            >
                Sign In
            </button>
        );
    }
    ```

### Patch Changes

- [#2795](https://github.com/solana-labs/solana-web3.js/pull/2795) [`ce876d9`](https://github.com/solana-labs/solana-web3.js/commit/ce876d99f04d539292abd810acd77a319c52f50d) Thanks [@steveluscher](https://github.com/steveluscher)! - Added React hooks to which you can pass a Wallet Standard `UiWalletAccount` and obtain a `MessageModifyingSigner`, `TransactionModifyingSigner`, or `TransactionSendingSigner` for use in constructing, signing, and sending Solana transactions and messages

- [#2772](https://github.com/solana-labs/solana-web3.js/pull/2772) [`8fe4551`](https://github.com/solana-labs/solana-web3.js/commit/8fe4551217a3ad8bfdcd1609ac7b23e8fd044c72) Thanks [@steveluscher](https://github.com/steveluscher)! - Added a series of React hooks to which you can pass a Wallet Standard `UiWalletAccount` to extract its `signMessage`, `signTransaction`, and `signAndSendTransaction` features

- [#3541](https://github.com/solana-labs/solana-web3.js/pull/3541) [`135dc5a`](https://github.com/solana-labs/solana-web3.js/commit/135dc5ad43f286380a4c3a689668016f0d7945f4) Thanks [@steveluscher](https://github.com/steveluscher)! - Drop the Release Candidate label and publish `@solana/web3.js` at version 2.0.0

- [#3137](https://github.com/solana-labs/solana-web3.js/pull/3137) [`fd72c2e`](https://github.com/solana-labs/solana-web3.js/commit/fd72c2ed1edad488318fa5d3e285f04852f4210a) Thanks [@mcintyre94](https://github.com/mcintyre94)! - The build is now compatible with the Vercel Edge runtime and Cloudflare Workers through the addition of `edge-light` and `workerd` to the package exports.

- Updated dependencies [[`9370133`](https://github.com/solana-labs/solana-web3.js/commit/9370133e414bfa863517248d97905449e9a867eb), [`31916ae`](https://github.com/solana-labs/solana-web3.js/commit/31916ae5d4fb29f239c63252a59745e33a6979ea), [`292487d`](https://github.com/solana-labs/solana-web3.js/commit/292487da00ee57350e8faf49ccf961203aed6403), [`7d310f6`](https://github.com/solana-labs/solana-web3.js/commit/7d310f6f9cd7d02fca4d6f8e311b857c9dd84e61), [`1ad523d`](https://github.com/solana-labs/solana-web3.js/commit/1ad523dc5792d9152a66e9dc2b83294e3eba4db0), [`89f399d`](https://github.com/solana-labs/solana-web3.js/commit/89f399d474abac463b1daaa864c88305d7b8c21f), [`ebb03cd`](https://github.com/solana-labs/solana-web3.js/commit/ebb03cd8270027db957d4cecc7d2374d468d4ccb), [`002cc38`](https://github.com/solana-labs/solana-web3.js/commit/002cc38a99cd4c91c7ce9023e1b4fb28f7e10832), [`ce1be3f`](https://github.com/solana-labs/solana-web3.js/commit/ce1be3fe37ea9b744fd836f3d6c2c8e5e31efd77), [`82cf07f`](https://github.com/solana-labs/solana-web3.js/commit/82cf07f4e905f6b056e70a0463a94222c3e7cadd), [`2d54650`](https://github.com/solana-labs/solana-web3.js/commit/2d5465018d8060eceb00efbf4f718df26d145199), [`135dc5a`](https://github.com/solana-labs/solana-web3.js/commit/135dc5ad43f286380a4c3a689668016f0d7945f4), [`bef9604`](https://github.com/solana-labs/solana-web3.js/commit/bef960435eb2303395bfa76e44f84d3348c5722d), [`7e86583`](https://github.com/solana-labs/solana-web3.js/commit/7e86583da68695076ec62033f3fe078b3890f026), [`4f19842`](https://github.com/solana-labs/solana-web3.js/commit/4f198423997d28d927f982333d268e19940656df), [`677a9c4`](https://github.com/solana-labs/solana-web3.js/commit/677a9c4eb88a8ac6a9ede8d82f367c5ac8d69ff4), [`38faba0`](https://github.com/solana-labs/solana-web3.js/commit/38faba05fab479ddbd95d0e211744d203f8aa823), [`2e5af9f`](https://github.com/solana-labs/solana-web3.js/commit/2e5af9f1a9410f15108863342b48225fdf9a0c83), [`cec9048`](https://github.com/solana-labs/solana-web3.js/commit/cec9048b2f83535df7e499db5488c336981dfb5a), [`b4bf318`](https://github.com/solana-labs/solana-web3.js/commit/b4bf318d7d4bdd639e4c126c70350993a8540fe8), [`e3e82d9`](https://github.com/solana-labs/solana-web3.js/commit/e3e82d909825e958ae234ed18500335a621773bd), [`2798061`](https://github.com/solana-labs/solana-web3.js/commit/27980617e4f8d34dbc7b6da4507e4bca68a68090), [`54d68c4`](https://github.com/solana-labs/solana-web3.js/commit/54d68c482feebf4e62a9896b3badd77dab615941), [`be36bab`](https://github.com/solana-labs/solana-web3.js/commit/be36babd752b1c987a2f53b4ff83ac8c045a3418), [`cb49bfa`](https://github.com/solana-labs/solana-web3.js/commit/cb49bfa28f412376a41e758eeda59e7e90983147), [`f2bb4e8`](https://github.com/solana-labs/solana-web3.js/commit/f2bb4e8c7f7efd049cb1c3810291c99e9293c25d), [`288029a`](https://github.com/solana-labs/solana-web3.js/commit/288029a55a5eeb863b6df960027a59214ffc37f1), [`4ae78f5`](https://github.com/solana-labs/solana-web3.js/commit/4ae78f5cdddd6772b25351beb813483d4e52cea6), [`478443f`](https://github.com/solana-labs/solana-web3.js/commit/478443fedac06678f12e8ac285aa7c7fcf503ee8), [`367b8ad`](https://github.com/solana-labs/solana-web3.js/commit/367b8ad0cce55a916abfb0125f36b6e844333b2b), [`fd72c2e`](https://github.com/solana-labs/solana-web3.js/commit/fd72c2ed1edad488318fa5d3e285f04852f4210a), [`4decebb`](https://github.com/solana-labs/solana-web3.js/commit/4decebb9b619972f49c740323b59cf470696e105), [`d4965ec`](https://github.com/solana-labs/solana-web3.js/commit/d4965ece9abaf81e3006442db15f3f77d89a622c), [`0158b31`](https://github.com/solana-labs/solana-web3.js/commit/0158b3181ed96996f269f3bff689f76411e460b3), [`22a34aa`](https://github.com/solana-labs/solana-web3.js/commit/22a34aa08d1be7e9b43ccfea94a99eaa2694e491), [`f9a8446`](https://github.com/solana-labs/solana-web3.js/commit/f9a84460670a97d4ab6514b28fe0d29c6fac3302), [`125fc15`](https://github.com/solana-labs/solana-web3.js/commit/125fc1540cfbc0a4afdba5aabac0884c750e58c1)]:
    - @solana/errors@2.0.0
    - @solana/transactions@2.0.0
    - @solana/addresses@2.0.0
    - @solana/keys@2.0.0
    - @solana/signers@2.0.0
    - @solana/promises@2.0.0

## 2.0.0-rc.4

### Patch Changes

- Updated dependencies [[`2798061`](https://github.com/solana-labs/solana-web3.js/commit/27980617e4f8d34dbc7b6da4507e4bca68a68090)]:
    - @solana/errors@2.0.0-rc.4
    - @solana/addresses@2.0.0-rc.4
    - @solana/keys@2.0.0-rc.4
    - @solana/signers@2.0.0-rc.4
    - @solana/transactions@2.0.0-rc.4
    - @solana/promises@2.0.0-rc.4

## 2.0.0-rc.3

### Patch Changes

- Updated dependencies []:
    - @solana/addresses@2.0.0-rc.3
    - @solana/errors@2.0.0-rc.3
    - @solana/keys@2.0.0-rc.3
    - @solana/promises@2.0.0-rc.3
    - @solana/signers@2.0.0-rc.3
    - @solana/transactions@2.0.0-rc.3

## 2.0.0-rc.2

### Patch Changes

- [#3137](https://github.com/solana-labs/solana-web3.js/pull/3137) [`fd72c2e`](https://github.com/solana-labs/solana-web3.js/commit/fd72c2ed1edad488318fa5d3e285f04852f4210a) Thanks [@mcintyre94](https://github.com/mcintyre94)! - The build is now compatible with the Vercel Edge runtime and Cloudflare Workers through the addition of `edge-light` and `workerd` to the package exports.

- Updated dependencies [[`292487d`](https://github.com/solana-labs/solana-web3.js/commit/292487da00ee57350e8faf49ccf961203aed6403), [`38faba0`](https://github.com/solana-labs/solana-web3.js/commit/38faba05fab479ddbd95d0e211744d203f8aa823), [`fd72c2e`](https://github.com/solana-labs/solana-web3.js/commit/fd72c2ed1edad488318fa5d3e285f04852f4210a), [`4decebb`](https://github.com/solana-labs/solana-web3.js/commit/4decebb9b619972f49c740323b59cf470696e105), [`d4965ec`](https://github.com/solana-labs/solana-web3.js/commit/d4965ece9abaf81e3006442db15f3f77d89a622c), [`0158b31`](https://github.com/solana-labs/solana-web3.js/commit/0158b3181ed96996f269f3bff689f76411e460b3)]:
    - @solana/addresses@2.0.0-rc.2
    - @solana/errors@2.0.0-rc.2
    - @solana/transactions@2.0.0-rc.2
    - @solana/promises@2.0.0-rc.2
    - @solana/signers@2.0.0-rc.2
    - @solana/keys@2.0.0-rc.2

## 2.0.0-rc.1

### Patch Changes

- Updated dependencies [[`7d310f6`](https://github.com/solana-labs/solana-web3.js/commit/7d310f6f9cd7d02fca4d6f8e311b857c9dd84e61), [`1ad523d`](https://github.com/solana-labs/solana-web3.js/commit/1ad523dc5792d9152a66e9dc2b83294e3eba4db0), [`b4bf318`](https://github.com/solana-labs/solana-web3.js/commit/b4bf318d7d4bdd639e4c126c70350993a8540fe8), [`f2bb4e8`](https://github.com/solana-labs/solana-web3.js/commit/f2bb4e8c7f7efd049cb1c3810291c99e9293c25d), [`f9a8446`](https://github.com/solana-labs/solana-web3.js/commit/f9a84460670a97d4ab6514b28fe0d29c6fac3302)]:
    - @solana/keys@2.0.0-rc.1
    - @solana/signers@2.0.0-rc.1
    - @solana/promises@2.0.0-rc.1
    - @solana/transactions@2.0.0-rc.1
    - @solana/addresses@2.0.0-rc.1
    - @solana/errors@2.0.0-rc.1

## 2.0.0-rc.0

### Minor Changes

- [#2928](https://github.com/solana-labs/solana-web3.js/pull/2928) [`bac3747`](https://github.com/solana-labs/solana-web3.js/commit/bac37479dcfad3da86ccd01da5095759f449eb3d) Thanks [@steveluscher](https://github.com/steveluscher)! - Added a `useSignIn` hook that, given a `UiWallet` or `UiWalletAccount`, returns a function that you can call to trigger a wallet's [&lsquo;Sign In With Solana&rsquo;](https://phantom.app/learn/developers/sign-in-with-solana) feature.

    #### Example

    ```tsx
    import { useSignIn } from '@solana/react';

    function SignInButton({ wallet }) {
        const csrfToken = useCsrfToken();
        const signIn = useSignIn(wallet);
        return (
            <button
                onClick={async () => {
                    try {
                        const { account, signedMessage, signature } = await signIn({
                            requestId: csrfToken,
                        });
                        // Authenticate the user, typically on the server, by verifying that
                        // `signedMessage` was signed by the person who holds the private key for
                        // `account.publicKey`.
                        //
                        // Authorize the user, also on the server, by decoding `signedMessage` as the
                        // text of a Sign In With Solana message, verifying that it was not modified
                        // from the values your application expects, and that its content is sufficient
                        // to grant them access.
                        window.alert(`You are now signed in with the address ${account.address}`);
                    } catch (e) {
                        console.error('Failed to sign in', e);
                    }
                }}
            >
                Sign In
            </button>
        );
    }
    ```

### Patch Changes

- Updated dependencies [[`677a9c4`](https://github.com/solana-labs/solana-web3.js/commit/677a9c4eb88a8ac6a9ede8d82f367c5ac8d69ff4)]:
    - @solana/errors@2.0.0-rc.0
    - @solana/signers@2.0.0-rc.0
    - @solana/transactions@2.0.0-rc.0
    - @solana/addresses@2.0.0-rc.0
    - @solana/keys@2.0.0-rc.0

## 2.0.0-preview.4

### Patch Changes

- [#2795](https://github.com/solana-labs/solana-web3.js/pull/2795) [`ce876d9`](https://github.com/solana-labs/solana-web3.js/commit/ce876d99f04d539292abd810acd77a319c52f50d) Thanks [@steveluscher](https://github.com/steveluscher)! - Added React hooks to which you can pass a Wallet Standard `UiWalletAccount` and obtain a `MessageModifyingSigner`, `TransactionModifyingSigner`, or `TransactionSendingSigner` for use in constructing, signing, and sending Solana transactions and messages

- [#2772](https://github.com/solana-labs/solana-web3.js/pull/2772) [`8fe4551`](https://github.com/solana-labs/solana-web3.js/commit/8fe4551217a3ad8bfdcd1609ac7b23e8fd044c72) Thanks [@steveluscher](https://github.com/steveluscher)! - Added a series of React hooks to which you can pass a Wallet Standard `UiWalletAccount` to extract its `signMessage`, `signTransaction`, and `signAndSendTransaction` features

- Updated dependencies [[`4f19842`](https://github.com/solana-labs/solana-web3.js/commit/4f198423997d28d927f982333d268e19940656df), [`cec9048`](https://github.com/solana-labs/solana-web3.js/commit/cec9048b2f83535df7e499db5488c336981dfb5a), [`be36bab`](https://github.com/solana-labs/solana-web3.js/commit/be36babd752b1c987a2f53b4ff83ac8c045a3418), [`cb49bfa`](https://github.com/solana-labs/solana-web3.js/commit/cb49bfa28f412376a41e758eeda59e7e90983147), [`367b8ad`](https://github.com/solana-labs/solana-web3.js/commit/367b8ad0cce55a916abfb0125f36b6e844333b2b), [`22a34aa`](https://github.com/solana-labs/solana-web3.js/commit/22a34aa08d1be7e9b43ccfea94a99eaa2694e491)]:
    - @solana/errors@2.0.0-preview.4
    - @solana/signers@2.0.0-preview.4
    - @solana/keys@2.0.0-preview.4
    - @solana/transactions@2.0.0-preview.4
    - @solana/addresses@2.0.0-preview.4
