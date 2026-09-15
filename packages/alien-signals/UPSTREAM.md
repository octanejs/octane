# Upstream crosswalk

## Source boundary

- React package: `react-alien-signals@0.4.0`.
- Canonical repository: <https://github.com/Rajaniraiyn/react-alien-signals>.
- Immutable commit: `2d85d8d063d79332ec7c7e99c07bda3a722f491a`.
- Published artifact integrity: `sha512-eYCneiYRa+9blKWkwrKCJ+NX9bUTmEOAaGmgF0u8UxzZgQOGfjO5TS2gg+fI5IvYiuKPM1p9hv2PwUTR22gviA==`.
- Reused framework-neutral engine: `alien-signals@3.2.1`, within upstream's `^3.2.1` range.

The complete source, test file, package manifest, tsconfig and MIT license are
retained byte-exact under `upstream/`. The authenticated npm artifact and its
published declarations are under `upstream-artifact/`. Both directories are
excluded from publication. `LICENSE` and `LICENSE.upstream` preserve the exact
upstream attribution in the published package. `audit/provenance.json` verifies
artifact hashes; `audit/upstream.lock.json` verifies the immutable Git blobs.

The native adapter translates React subscription and effect ownership to Octane
manual hook slots. The signal engine remains an ordinary dependency. The source
closure is recorded in `audit/closure.json`; no React runtime or React types ship.

## Public contract

Every upstream runtime and type export is represented at `@octanejs/alien-signals`.
The 0.4.0 additions are `batch`, `trigger`, `useDeferredSignalValue`,
`useSignalSelector`, the passive/layout/insertion signal effects, and their named
types. `createComputed` receives its previous value. Effects and scopes accept
explicit dependency lists. Phase hooks require a referentially stable signal list.

Compatibility extensions are retained: direct signal setters accept updaters,
`DependencyList` remains a named type export, and incidental non-function return
values from `createEffect` do not become cleanup functions. The scope stop
controller remembers cancellation before commit and across later dependency
changes. Upstream 0.4.0 starts scopes after commit too, but its stop does not
remember pre-commit cancellation. Readable computed signals are now accepted by
both packages; the previous declaration divergence has been removed.

## Runtime and type evidence

The complete original Bun suite executes unchanged and has 36 cases. The adapted
suite preserves every case title and cites its exact source line. An AST crosswalk
checks assertions, observations, fixtures and accepted API calls, with negative
controls for deleting or weakening evidence. `audit/registrations.json` preserves
all preflight identities; `audit/crosswalk.json` maps each to native evidence.

The intentional workspace oracle is recorded and enforced by
`audit/pristine-oracle-environment.json`. It uses React/React DOM 19.2.7 within the
published >=19.2.0 peer range, Testing Library React 16.3.2, Happy DOM 20.11.2,
and Bun 1.3.14. Strict pristine checking uses compatible Bun 1.3.14 and Node 25.9.5
declarations as test-only dependencies. The Bun declarations use the explicit
`pristine-bun-types` alias and a pristine-only import mapping, so unrelated build
plugins retain the workspace Bun type environment. Authored and browser source
programs use no Node ambient types. Upstream files remain unchanged. This release has no negative type assertions;
paired public probes retain independent negative controls. All 90 accepted public API call occurrences have matching
adapted type witnesses. Separate strict public contracts cover every export.

Native-only tests cover stable setter identity, signal replacement, cancellation,
function-valued setters and effect cleanup. Actual Node SSR and hydration tests
cover snapshot output, DOM adoption, selector/deferred updates, phase ordering,
cleanup and exclusions of client effects on the server.

## Registration crosswalk

| Upstream case | Source line | Native evidence |
| --- | --- | --- |
| should create a writable signal | 40 | `tests/upstream-adapted.test.ts` |
| should create and update a computed signal | 48 | `tests/upstream-adapted.test.ts` |
| should create and run an effect | 65 | `tests/upstream-adapted.test.ts` |
| should create a signal scope | 79 | `tests/upstream-adapted.test.ts` |
| useSignal should return [value, setter] | 96 | `tests/upstream-adapted.test.ts` |
| useSignalValue should return read-only value from a signal | 106 | `tests/upstream-adapted.test.ts` |
| useSetSignal should return setter only | 115 | `tests/upstream-adapted.test.ts` |
| useSignalEffect should register an effect in React | 131 | `tests/upstream-adapted.test.ts` |
| useSignalScope should create and manage an effect scope in React | 144 | `tests/upstream-adapted.test.ts` |
| useComputed should return a computed value | 150 | `tests/upstream-adapted.test.ts` |
| should handle nested signal updates correctly | 164 | `tests/upstream-adapted.test.ts` |
| should handle signal updates within effects | 178 | `tests/upstream-adapted.test.ts` |
| should properly cleanup effects when scope is stopped | 194 | `tests/upstream-adapted.test.ts` |
| useSignal should handle functional updates correctly | 223 | `tests/upstream-adapted.test.ts` |
| useComputed should update when dependencies change | 235 | `tests/upstream-adapted.test.ts` |
| useComputed should not enter a render loop after a dependency update | 256 | `tests/upstream-adapted.test.ts` |
| useComputed should reuse the computed across re-renders when deps are unchanged | 280 | `tests/upstream-adapted.test.ts` |
| useComputed should rebuild the computed when deps change | 305 | `tests/upstream-adapted.test.ts` |
| useSignalEffect should handle cleanup correctly | 327 | `tests/upstream-adapted.test.ts` |
| should handle signal updates correctly | 350 | `tests/upstream-adapted.test.ts` |
| should handle multiple signal updates | 368 | `tests/upstream-adapted.test.ts` |
| should handle undefined/null signal values | 394 | `tests/upstream-adapted.test.ts` |
| should handle computed dependencies correctly | 409 | `tests/upstream-adapted.test.ts` |
| should cleanup all subscriptions on unmount | 430 | `tests/upstream-adapted.test.ts` |
| should handle multiple mount/unmount cycles | 457 | `tests/upstream-adapted.test.ts` |
| should handle concurrent updates correctly | 485 | `tests/upstream-adapted.test.ts` |
| lets React automatically batch multiple signal notifications into one render | 511 | `tests/upstream-adapted.test.ts` |
| batches multiple writes into one propagation | 530 | `tests/upstream-adapted.test.ts` |
| manually triggers dependents after an in-place mutation | 547 | `tests/upstream-adapted.test.ts` |
| shares a source safely across multiple React subscribers | 558 | `tests/upstream-adapted.test.ts` |
| skips React renders when a selected signal slice is unchanged | 580 | `tests/upstream-adapted.test.ts` |
| does not create a signal scope during server rendering | 598 | `tests/upstream-adapted.test.ts` |
| keeps snapshots consistent when a signal write occurs in a transition | 610 | `tests/upstream-adapted.test.ts` |
| offers a deferred snapshot without changing the source value | 623 | `tests/upstream-adapted.test.ts` |
| runs insertion, layout, and passive signal effects in React order | 637 | `tests/upstream-adapted.test.ts` |
| cleans a manually stopped React scope exactly once | 667 | `tests/upstream-adapted.test.ts` |
