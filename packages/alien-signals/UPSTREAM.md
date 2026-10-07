# Upstream crosswalk

## Pin

- React package: `react-alien-signals@0.4.0`
- Canonical repository: <https://github.com/Rajaniraiyn/react-alien-signals>
- Immutable commit: `2d85d8d063d79332ec7c7e99c07bda3a722f491a` (tag `v0.4.0`; the npm SLSA
  provenance attestation for the published tarball names this commit)
- Published tarball: `sha512-eYCneiYRa+9blKWkwrKCJ+NX9bUTmEOAaGmgF0u8UxzZgQOGfjO5TS2gg+fI5IvYiuKPM1p9hv2PwUTR22gviA==`;
  `audit/react-parity.json` records its SHA-256 as the provenance integrity
- Advertised compatibility: `react-alien-signals@0.4.0`
- Reused core: `alien-signals@3.2.1` (the upstream peer range is `^3.2.1`)
- React oracle suite: the pinned repository's `src/index.test.ts`, authored for React 19.2
  (`react >=19.2.0` peer)
- Pristine oracle environment (intentional workspace pin, enforced at run time by
  [`audit/pristine-oracle-environment.json`](./audit/pristine-oracle-environment.json)):
  - `react@19.2.7` / `react-dom@19.2.7`
  - `@testing-library/react@16.3.2`
  - `@happy-dom/global-registrator@20.11.2`
  - `@testing-library/jest-dom@6.9.1`
- Upstream `package.json` at the pin develops against looser or newer ranges (`react@^19.2.8`,
  `@testing-library/react@^16.2.0`, `@happy-dom/global-registrator@^17.1.3`). The pristine lane
  does **not** silently inherit whatever happens to sit in `node_modules`; it records and verifies
  the workspace-selected oracle versions above, which satisfy the published `react >=19.2.0`
  peer, before executing the suite.

The published tarball supplies the built single-entry package. The canonical repository at the
commit above supplies the TypeScript source, test suite, and MIT license. Those files are vendored
byte-for-byte under [`upstream/`](./upstream/), pinned by `audit/upstream.lock.json` (each
committed file verifies offline against its upstream git blob sha;
`pnpm react-port:materialize run --check --package-dir packages/alien-signals`), and are excluded
from the published package by the manifest's explicit `files` list. The pinned `package.json`
declares `license: "MIT"`, which matches the registry metadata and the pinned commit's LICENSE
(retained byte-exact as `LICENSE.upstream`, hash-matched to the lock).

Run `pnpm --dir packages/alien-signals upstream:verify` to reject removed or modified pinned
evidence. The checksum ledger covers the source, complete upstream test file, and license.

Parity ownership, inventories, and lane registration live in
[`audit/react-parity.json`](./audit/react-parity.json).

## Export crosswalk

The pinned package has one public entry point, `react-alien-signals`.

| Upstream export | Octane disposition | Evidence |
| --- | --- | --- |
| `ReadableSignal`, `WritableSignal`, `SignalSetter`, `SignalEffectCallback`, `SignalEffectDependencies` | Ported types | [`public-api.test-d.ts`](./typetests/public-api.test-d.ts) |
| `createSignal` | Ported; returns the unchanged core signal | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| `createComputed` | Ported, including the getter's previous-value argument | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts), [`public-api.test-d.ts`](./typetests/public-api.test-d.ts) |
| `createEffect` | Ported over the unchanged core, including effect cleanups | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| `createSignalScope` | Ported over the unchanged core | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| `batch` | Ported over the core's batch depth | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| `trigger` | Ported over the core | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| `useSignal` | Ported with Octane manual slot forwarding | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts), `packages/octane/tests/external-hook-slot.test.ts` |
| `useSignalValue` | Ported; one shared core subscription per signal | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts), [`octane-contracts.test.ts`](./tests/octane-contracts.test.ts) |
| `useDeferredSignalValue` | Ported over Octane `useDeferredValue` | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| `useSignalSelector` | Ported | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| `useSetSignal` | Ported with stable identity and signal replacement | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts), [`octane-contracts.test.ts`](./tests/octane-contracts.test.ts) |
| `useSignalEffect` | Ported, including the optional dependency list | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts), [`octane-contracts.test.ts`](./tests/octane-contracts.test.ts), [`render-safety.test.ts`](./tests/ssr/render-safety.test.ts) |
| `useSignalPassiveEffect`, `useSignalLayoutEffect`, `useSignalInsertionEffect` | Ported over the matching Octane effect phases | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts), [`octane-contracts.test.ts`](./tests/octane-contracts.test.ts) |
| `useSignalScope` | Ported, including the optional dependency list and stable stop handle | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts), [`octane-contracts.test.ts`](./tests/octane-contracts.test.ts) |
| `useComputed` | Ported; the caller's dependency list is passed directly to memoization | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |

`DependencyList` is an explicit Octane type export. Upstream imports React's type of the same
name for the dependency parameters.

## Type suite

Upstream ships an executable typecheck: `package.json` defines `typecheck: tsc --noEmit`, and the
pinned `tsconfig.json` typechecks `src/index.ts` plus `src/index.test.ts`. Those artifacts are
vendored under [`upstream/`](./upstream/) and run byte-exact in the
`alien-signals-pristine-types` lane. The pinned suite carries no `@ts-expect-error` groups, so
`typetests/upstream-typecheck.test-d.ts` pins its full accepted public-API call inventory.
Paired public-API probes, including the negative controls, live under `audit/type-probes/`
(compiled against the vendored React source) and `typetests/` (compiled against Octane).

## Test disposition

The pinned repository contains one runtime test file, `src/index.test.ts`. It is vendored unchanged
at [`upstream/src/index.test.ts`](./upstream/src/index.test.ts) and executes byte-exact in the
`alien-signals-pristine` lane via bun. Each adapted case keeps the upstream title and cites
`// Per src/index.test.ts:<line>` in [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts).

| Upstream case | Line | Octane evidence |
| --- | --- | --- |
| should create a writable signal | 40 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should create and update a computed signal | 48 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should create and run an effect | 65 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should create a signal scope | 79 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useSignal should return [value, setter] | 96 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useSignalValue should return read-only value from a signal | 106 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useSetSignal should return setter only | 115 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useSignalEffect should register an effect in React | 131 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useSignalScope should create and manage an effect scope in React | 144 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useComputed should return a computed value | 150 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle nested signal updates correctly | 164 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle signal updates within effects | 178 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should properly cleanup effects when scope is stopped | 194 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useSignal should handle functional updates correctly | 223 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useComputed should update when dependencies change | 235 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useComputed should not enter a render loop after a dependency update | 256 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useComputed should reuse the computed across re-renders when deps are unchanged | 280 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useComputed should rebuild the computed when deps change | 305 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useSignalEffect should handle cleanup correctly | 327 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle signal updates correctly | 350 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle multiple signal updates | 368 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle undefined/null signal values | 394 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle computed dependencies correctly | 409 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should cleanup all subscriptions on unmount | 430 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle multiple mount/unmount cycles | 457 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle concurrent updates correctly | 485 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) (same `Promise.all` + microtask setters; final value) |
| lets React automatically batch multiple signal notifications into one render | 511 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| batches multiple writes into one propagation | 530 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| manually triggers dependents after an in-place mutation | 547 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| shares a source safely across multiple React subscribers | 558 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| skips React renders when a selected signal slice is unchanged | 580 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| does not create a signal scope during server rendering | 598 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) (Octane SSR compile and `renderToString` through the shared hydration fixture renderer) |
| keeps snapshots consistent when a signal write occurs in a transition | 610 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) (Octane `StrictMode` has no double invoke) |
| offers a deferred snapshot without changing the source value | 623 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| runs insertion, layout, and passive signal effects in React order | 637 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| cleans a manually stopped React scope exactly once | 667 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |

Octane-only framework contracts stay outside parity ownership: SSR render safety in
[`render-safety.test.ts`](./tests/ssr/render-safety.test.ts), hydration adoption in
[`hydration.test.ts`](./tests/hydration.test.ts), setter identity, stable scope stop handles, and
explicit dependency lists in [`octane-contracts.test.ts`](./tests/octane-contracts.test.ts),
manual slot isolation in `packages/octane/tests/external-hook-slot.test.ts`, and central
playground registration in `playground/octane/src/demos/AlienSignals.test.ts`.

## Intentional divergences

None. The 0.3.0 pin recorded two: `useSignalValue` accepting readable computed signals, and
`useSignalScope` starting after commit with a pre-commit cancellation. Upstream 0.4.0 declares the
readable overload and starts scopes in a post-commit effect, so the port now follows its
semantics exactly, including a stop handle that is a no-op before commit and a scope that
restarts when its dependencies change.

Octane hooks carry compiler slots internally; this is invisible to consumers and required for
stable composition outside `.tsrx` modules.
