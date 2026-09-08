# @solana/react upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `@solana/react` |
| Version | `7.0.0` |
| Canonical tag commit | `58df993f4bea388121a872b33038c6af0ca3dd90` |
| Supported upstream range | exactly `7.0.0` |
| React oracle | `19.2.3` with `@types/react@19.2.7` |
| License | MIT |

The npm package publishes `src/` and built `dist/`, but the repository at tag
`v7.0.0` is the authoritative source for the full unit and type suites. The
byte-exact `packages/react` directory from that commit is vendored under
`upstream/` and verifies offline against the upstream git blob shas recorded in
`audit/upstream.lock.json`; the pinned license is republished at the package
root as `LICENSE.upstream`. The vendored tree is excluded from the published
package by the explicit `files` allowlist.

Framework-neutral Kit operations stay on `@solana/kit@7.0.0`. This package is
the Octane reactive UI seam: client provider/store, Wallet Standard discovery,
TanStack request queries, and an explicit-action transaction executor.

Run `pnpm --dir packages/solana-kit upstream:verify` to verify every vendored
byte.

## Runtime export crosswalk

| Upstream export | Octane disposition | Evidence |
|---|---|---|
| `ClientProvider`, `ClientProviderProps`, `ClientContext` | Ported; sync clients only (async promise/Suspense clients are a recorded divergence) | `tests/upstream/client-provider.test.ts`, pristine ClientProvider suite |
| `useClient` | Ported with slot forwarding; throws a plain `Error` instead of `SolanaError` | `tests/upstream/client-provider.test.ts` |
| `useClientCapability`, `UseClientCapabilityConfig` | Ported with slot forwarding; throws a plain `Error` instead of `SolanaError` | `tests/upstream/use-client-capability.test.ts` |
| `useRequest` / `useRequestResult` | Not ported; request work goes through `@octanejs/solana-kit/query` | gap / out of scope for this surface |
| `useRequestQuery` (`@solana/react/query`) | Ported as `useRequestQuery` over `@octanejs/tanstack-query`, including `ReactiveActionSource`, function sources, and `getAbortSignal` | `tests/upstream/use-request-query.test.ts`, pristine useRequestQuery suite |
| `useSubscription*` / `useTrackedData*` | Deferred pending streamed-query lifecycle characterization | gap |
| `@solana/react/swr` | Excluded; Octane has no SWR binding | gap |
| Selected-wallet provider / signer hooks | Replaced by structural `createWalletStore` (no React / `@wallet-standard/react` types on the public boundary) | `tests/wallet.test.ts` (Octane conformance) |
| Sign-in / sign-message / sign-transaction hooks | Represented by `createTransactionExecutor` explicit-action flow | `tests/transactions.test.ts` (Octane conformance) |
| `useAction`, `useLatest`, `useReactiveStoreLifecycle`, `staticStores` | Internal upstream helpers; not public Octane surface | out of scope |

## Test-suite disposition

Parity-owned adapted cases live only under `tests/upstream/`. Ordinary
Octane-authored conformance stays in `tests/*.test.ts` and is outside
`testExecution` ownership. Octane-only declaration probes live in
`typetests/public-api.test-d.ts` and are **not** parity type evidence.

### Runtime files

| Upstream artifact | Disposition |
|---|---|
| `src/__tests__/ClientProvider-test.browser.tsx` | Pristine-run in full. Sync publish/nested/missing-provider cases adapted in `tests/upstream/client-provider.test.ts`. Async client / Suspense cases are pristine-only (Octane `ClientProvider` accepts a resolved client). |
| `src/__tests__/useClientCapability-test.browser.tsx` | Pristine-run in full. Present/missing/partial-array cases adapted in `tests/upstream/use-client-capability.test.ts`. |
| `src/query/__tests__/useRequestQuery-test.browser.tsx` | Pristine-run in full. Function-source, ReactiveActionSource, null/enabled, getAbortSignal, refetch-closure, and SSR cases adapted in `tests/upstream/use-request-query.test.ts`. |
| `src/__tests__/SelectedWalletAccountContextProvider-test.browser.tsx` | Out of scope: Octane replaces selected-wallet React context with structural `createWalletStore` (no `@wallet-standard/react` public types). |
| `src/__tests__/staticStores-test.ts` | Out of scope: internal upstream disabled-store helpers, not a public Octane export. |
| `src/__tests__/useAction-test.browser.tsx` | Out of scope: internal upstream helper; not exported by `@octanejs/solana-kit`. |
| `src/__tests__/useLatest-test.browser.tsx` | Out of scope: internal upstream helper; Octane bindings use slot-aware refs instead. |
| `src/__tests__/useReactiveStoreLifecycle-test.browser.tsx` | Out of scope: internal upstream helper for Kit store wiring, not a public Octane export. |
| `src/__tests__/useRequest-test.browser.tsx` | Out of scope: Octane does not port `useRequest`; request UI goes through `useRequestQuery`. |
| `src/__tests__/useSignAndSendTransaction-test.ts` | Out of scope: signing surface replaced by `createTransactionExecutor`. |
| `src/__tests__/useSignIn-test.ts` | Out of scope: signing surface replaced by `createTransactionExecutor`. |
| `src/__tests__/useSignMessage-test.ts` | Out of scope: signing surface replaced by `createTransactionExecutor`. |
| `src/__tests__/useSignTransaction-test.ts` | Out of scope: signing surface replaced by `createTransactionExecutor`. |
| `src/__tests__/useSubscription-test.browser.tsx` | Out of scope for this pin: streamed-query lifecycle not yet characterized on Octane. |
| `src/__tests__/useTrackedData-test.browser.tsx` | Out of scope for this pin: streamed-query lifecycle not yet characterized on Octane. |
| `src/__tests__/useWalletAccountMessageSigner-test.ts` | Out of scope: wallet-account signer hooks replaced by `createWalletStore` / executor. |
| `src/__tests__/useWalletAccountTransactionSendingSigner-test.ts` | Out of scope: wallet-account signer hooks replaced by `createWalletStore` / executor. |
| `src/__tests__/useWalletAccountTransactionSigner-test.ts` | Out of scope: wallet-account signer hooks replaced by `createWalletStore` / executor. |
| `src/query/__tests__/bridgeStoreToAsyncIterable-test.ts` | Out of scope: framework-neutral bridge used only by deferred subscription/tracked query adapters. |
| `src/query/__tests__/useSubscriptionQuery-test.browser.tsx` | Out of scope for this pin: streamed TanStack subscription adapter deferred. |
| `src/query/__tests__/useTrackedDataQuery-test.browser.tsx` | Out of scope for this pin: streamed TanStack tracked-data adapter deferred. |
| `src/swr/__tests__/bridgeStoreToSWR-test.ts` | Out of scope: Octane has no SWR binding. |
| `src/swr/__tests__/useRequestSWR-test.browser.tsx` | Out of scope: Octane has no SWR binding. |
| `src/swr/__tests__/useSubscriptionSWR-test.browser.tsx` | Out of scope: Octane has no SWR binding. |
| `src/swr/__tests__/useTrackedDataSWR-test.browser.tsx` | Out of scope: Octane has no SWR binding. |

Omission/rename negative controls for the pristine runtime inventory live in
`scripts/react-parity/solana-kit-parity-controls.test.mjs`.

### Type files

Machine-checkable dispositions live in
`packages/solana-kit/audit/type-parity.json` (`fileDispositions`). The pristine
type lane runs every `adapted` and `pristine-only` artifact; the adapted lane
mirrors every `adapted` file one-for-one.

| Upstream artifact | Disposition |
|---|---|
| `src/__typetests__/useClient-typetest.ts` | `adapted` — pristine + one-for-one under `typetests/__typetests__/`. |
| `src/__typetests__/useClientCapability-typetest.ts` | `adapted` — pristine + one-for-one under `typetests/__typetests__/`. |
| `src/query/__typetests__/useRequestQuery-typetest.ts` | `adapted` — pristine + one-for-one under `typetests/query/__typetests__/`. |
| `src/__typetests__/selectedWalletAccountContextProvider-typetest.ts` | `pristine-only` — React selected-wallet types retained in the pristine lane; Octane replacement types in `typetests/wallet-transaction-typetest.ts`. |
| `src/__typetests__/useSignIn-typetest.ts` | `pristine-only` — retained in the pristine lane; replaced by `createTransactionExecutor` (adaptedEvidence). |
| `src/__typetests__/useSignAndSendTransaction-typetest.ts` | `pristine-only` — retained in the pristine lane; replaced by `createTransactionExecutor` (adaptedEvidence). |
| `src/__typetests__/useSignTransaction-typetest.ts` | `pristine-only` — retained in the pristine lane; replaced by `createTransactionExecutor` (adaptedEvidence). |
| `src/__typetests__/useRequest-typetest.ts` | `pristine-only` — retained; request UI goes through adapted `useRequestQuery`. |
| `src/__typetests__/useSubscription-typetest.ts` | `pristine-only` — streamed query surface deferred; still typechecked pristine. |
| `src/__typetests__/useTrackedData-typetest.ts` | `pristine-only` — streamed query surface deferred; still typechecked pristine. |
| `src/query/__typetests__/useSubscriptionQuery-typetest.ts` | `pristine-only` — streamed TanStack subscription adapter deferred; still typechecked pristine. |
| `src/query/__typetests__/useTrackedDataQuery-typetest.ts` | `pristine-only` — streamed TanStack tracked-data adapter deferred; still typechecked pristine. |
| `src/__typetests__/useAction-typetest.ts` | `out-of-scope` — internal helper, not exported. |
| `src/swr/__typetests__/useRequestSWR-typetest.ts` | `out-of-scope` — Octane has no SWR binding. |
| `src/swr/__typetests__/useSubscriptionSWR-typetest.ts` | `out-of-scope` — Octane has no SWR binding. |
| `src/swr/__typetests__/useTrackedDataSWR-typetest.ts` | `out-of-scope` — Octane has no SWR binding. |

Type inventories, the permitted-transformation ledger, and skipped-file /
deleted-assertion / removed-`@ts-expect-error` / omitted-disposition negative
controls live in `packages/solana-kit/audit/type-parity.json` and
`scripts/react-parity/solana-kit-types-lib{,.test}.mjs`.

## Intentional divergences

- Missing-provider and missing-capability failures throw plain `Error` messages rather than `@solana/kit` `SolanaError` codes.
- `ClientProvider` does not accept a `Promise<Client>` and does not suspend; callers resolve async plugin setup before mount. Passing a thenable throws at runtime.
- Wallet and transaction APIs are Octane-native rather than upstream selected-wallet / sign-* hooks.
- `useRequestQuery` additionally accepts an Octane `{ send }` source shape for Kit transports that expose `send({ abortSignal })` rather than `reactiveStore()`.
