# TanStack React Pacer upstream ledger

`@octanejs/tanstack-pacer` targets `@tanstack/react-pacer@0.23.0` from
`https://github.com/TanStack/pacer.git`.

## Immutable pin

- Tag: `@tanstack/react-pacer@0.23.0`
- Resolved commit: `c75895520669b08dc8946b42e1a6d529ca977230`
- npm archive SHA-256: `9662c2a241e21e2f3c8f534195516ce5060b4d13b1997fca96daea797be9f3a1`
- npm lock integrity: `sha512-Ec3h+kT8kYlpGb1M8F7836q+udE/M2RmE8KLr1rhs+UDBgvxjfmyR2bIUeaDEe9Zn1YXNI986RbErXyr5fEJIg==`
- Supported range: exactly `0.23.0`
- License: MIT
- React oracle: exact `react@19.2.7`, `react-dom@19.2.7`, `@types/react@19.2.17`, and `@types/react-dom@19.2.3` via the `tanstack-pacer-react-oracle` catalog
- Framework-neutral core: exact `@tanstack/pacer@0.22.0`, reused by both adapters

## Source, exports, and suites

The byte-exact tagged adapter directory is vendored under `upstream/`; all 51 files verify
offline against the upstream git blob shas recorded in `audit/upstream.lock.json`, and the
pinned root license is republished at the package root as `LICENSE.upstream`, hash-matched
to the lock's license evidence. The tagged package contains no
runtime test, fixture, or snapshot artifacts. Upstream's `test:types` script compiles package source
with `tsc` and has no dedicated type-assertion files, so suite presence is `insufficient` while
compile lanes still run.

`audit/upstream-crosswalk.json` accounts for all 16 published entrypoints and every adapter
value/type export plus each core `export *` re-export, with a disposition and evidence pointer per
row. The binding reuses the exact framework-neutral core. All adapter source files retain the complete structural crosswalk. Independently authored strict type probes consume all public entrypoints, while runtime differential scenarios cover scheduler results and lifecycle. Upstream suite absence is preserved rather than represented as an upstream test pass.

## Type lanes

- Pristine: `typetests/pristine` runs `tsc` over the vendored React adapter source (upstream
  `test:types`) with pinned React types. Inventory: `audit/upstream-types.json`.
- Adapted: `typetests/adapted` compiles the complete Octane adapter source through
  `tsrx-tsc` (one-for-one with upstream `test:types`). Inventory:
  `audit/adapted-types.json`. Permitted transforms (structurally enforced):
  `typetests/assertions.md`.
- Ordinary Octane-only: `typetests/octane-only/setter-types.test-d.ts` holds
  accept/reject evidence for local `Dispatch` / `SetStateAction` aliases outside
  required React-parity ownership (no pristine React assertion counterpart). Root
  `bindings:typecheck` runs `typetests/octane-only/tsconfig.json` so this evidence
  executes in the always-on ordinary typecheck control plane.

## Executable evidence

A repo-authored adapted-octane Vitest suite covers the Octane scheduler lifecycle (debounce,
throttle, batching, and teardown cancellation). A paired differential runs the same compiled
fixture against the Octane and React adapters under Vitest fake timers, advancing the exact waits
and asserting intermediate observable DOM. `tests/pacer.test.ts` and
`tests/parity/contracts.test.ts` remain Octane-only contracts and are not counted as React parity.

This representative scheduler lifecycle does not exhaustively prove every sync/async hook family,
provider, render-prop subscription, state/value helper, or option combination; those remain
surface-present via the crosswalk without additional runtime cases.

## Source boundary

The 43 upstream source modules are adapted into 45 owned modules; the provider context and slot helper are separate Octane modules. The complete 51-file immutable adapter tree is unpublished and verified by audit/upstream.lock.json. The upstream MIT license is retained byte-exact as LICENSE.upstream. All framework-neutral scheduler implementation comes directly from @tanstack/pacer 0.22.0, and Store comes through @octanejs/tanstack-store. React is test-only. The npm artifact is hash-verified for public declaration comparison and excluded from publication.

## Updated contracts

The three async callback helpers return Promise<Awaited<ReturnType<TFn>> | undefined>, including suppressed executions. The paired runtime fixture checks completed values and disabled results; separate positive/negative programs reproduce the old nested-promise defect. Subscribe renderables use OctaneNode, whose opaque renderer contract intentionally differs from ReactNode.

The public probes compare framework-neutral exports to their pinned declarations. Adapter probes compare scheduler members, selected state, and callbacks; renderer-specific Subscribe/children and onUnmount members are covered by the complete source transformation crosswalk and runtime ownership scenarios rather than compared as React element types. All ten scheduler families preserve store identity through renders and invoke their owning teardown once. Nested provider defaults remain isolated, and the real SSR compiler produces HTML that hydration adopts while callbacks stay interactive.
