# View Transitions compatibility record

## Reference versions

The September 2026 audit compares Octane with React 19.3.0
(`1d34f91dfde6bba84d08b683aaba164c7194dacb`) and React main
(`9b9385327857d1211fb4dc022122d897fb38bc5a`) for experimental parent relays.
The original July implementation used callback-only mocks; native browser
regressions now cover captures, CSS, interaction, readiness, and cleanup too.

## Implemented contracts and evidence

| Contract | Primary regression coverage |
| --- | --- |
| All matching type classes, `none` precedence, default fallback, actual activation classes | `tests/view-transition-matching.test.ts`, native browser suite |
| Stable automatic names, instance refs, pseudo-element methods, cleanup at native finish | `tests/view-transition-lifecycle.test.ts`, native browser suite |
| Authored style restoration, descriptor and compiled DOM mutations, all-host geometry | Matching, lifecycle, and native browser suites |
| Nested shared elements, viewport suppression, clipping ancestors, handler-only parent relays | Matching and existing conformance suites |
| Native transition types, outside-region interaction, urgent interruption | `tests/browser/view-transition-parity/` |
| Prepared DOM stays private until native update; keyed survivors retain identity | Native staged-commit controls |
| Suspended plans discard writes; reentrant renders preserve accepted work and retired cleanup | `tests/view-transition-staging.test.ts` |
| Deferred hydration resources survive preparation and abort | `tests/hydration/deferred-hydration-contract.test.ts` |
| Mutation/insertion → resource wait → layout refs/effects → navigation wait → new capture | Layout-readiness feature and native browser suites |
| Streaming annotations, native reveal driver, client coordination, hydration adoption | `tests/view-transition-ssr.test.ts`, native streaming coverage |
| Error recovery and unsupported-browser fallback | Lifecycle and streaming suites |
| Element scopes, native local pseudo targets, independent sibling/nested animations and shared capture barriers | `tests/browser/view-transition-scopes/`, native streaming coverage |
| Scope scheduling, per-batch passive lifetime, local Suspense, invalid hosts and outside portals | `tests/view-transition-scoped-effects.test.ts` |
| Optional-feature bundle boundaries and active-transition DOM reads | `benchmarks/view-transitions/` |

## Why the eager-rendering decision changed

The plan at main `277c10c3fa80f56ef162959832dba35c1b43b32e` explicitly rejected a
staged-mutation reconciler mode: keeping eager host writes was preferred to
React’s snapshot timing. That decision made a boundary’s next `update` prop unavailable when choosing
its old snapshot. A nested boundary
switching its own `update` to `none` in the animated render must remain in the
parent’s old snapshot; giving it a separate old name leaves stale pixels animating
beside the parent. The new `update` prop is the requirement that makes preparing
the next tree necessary. A changed `name` keeps the previous name for the old
capture and the next name for the new capture, matching React’s
[`commitBeforeUpdateViewTransition`](https://github.com/facebook/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberCommitViewTransitions.js#L670).

The compatibility request was explicitly expanded to staged DOM commits after
this conflict was demonstrated. Preparation now evaluates the next tree and
boundary props before native capture, with connected host mutations withheld
until the native update callback. The own-prop regressions in the native parity
suite exercise both cases. This is a deliberate performance trade-off: active
transition preparation allocates a host projection and a commit plan. Once a ViewTransition-facing API installs its driver, all-transition flushes may still
need preparation to discover newly entering boundaries even if no boundary is
currently mounted. Ordinary rendering remains eager. Byte, browser-work and
large-list measurements are recorded in `benchmarks/view-transitions/RESULTS.md`;
those measurements do not establish that preparation is free.

## Architecture

ViewTransition prepares its next tree before the native old capture. An optional
DOM plan projects structural reads and host writes without changing existing
native nodes. The finished boundary props select old-capture participation and classes, so a
nested `update="none"` remains inside its parent's snapshot. Each snapshot
retains its own name.
The native update callback publishes the ordered plan once, preserving survivor
identity and connected deletion cleanup. Ordinary rendering keeps its eager
native DOM path; host views and mutation plans are allocated only while a
ViewTransition prepares.

The structural read seam is `getFirstChild` / `getNextSibling`; these use cached
native getters normally and the staged view during preparation. Other host
operations use typed `domNode` views. `pnpm staged-dom:check` resolves DOM members
through TypeScript (including traceable aliases and casts) and rejects raw host
operations outside a small, operation-specific native allowlist. The guard and
mutation tests run in the existing CI workflow tests. Committed geometry,
resource readiness, imperative public handles, and eager event registration are
explicit native exceptions. This is static enforcement for typed or traceable
host receivers, not a proof about arbitrary untyped application code.

`initDomOperations` previously initialized only the two traversal getters. It
was not a complete read/write operations table. Replacing projected form,
selector, property and CSSOM semantics with a new table would require a broader
host API migration. This change consolidates structural access and adds the
missing enforcement while retaining the tested projection adapter. A future
operations-table migration must preserve projected form ownership, result
identity, native scroll geometry, controlled state and rollback contracts.

DOM observation and controlled-property snapshots during native commits detect
updates from compiled templates and returned descriptors. A layout capture
defers new refs and layout bodies until resource readiness. Every
boundary's visible top-level hosts contribute geometry; layout changes can
activate clipping ancestors. Temporary capture styles are restored before
mutation publication and again after the new capture.

Owner lookups are intentionally recomputed across preparation, publication and
layout callbacks: portal destinations, scope hosts and CSS participation can
change at each phase. A cache would need to track those invalidations. The
committed-DOM observer still watches document/shadow roots so newly introduced
hosts and stylesheet resources are observed. It therefore also allocates
records for unrelated writes during the commit; the current measurements do
not establish an allocation or whole-page latency improvement there. Old
geometry measurements omit unused clip-style reads; post-layout measurements
retain them for clipping activation.

The client and optional streaming driver share the actual native document handle
and a lazily allocated map of element handles. A batch prepares and publishes once.
Element native callbacks enter before a document capture starts, preventing a
document callback from blocking an element callback needed by the same batch.
The preparation lock lasts through every participant's `ready` settlement. After
that, independent scopes can animate concurrently. A queued ancestor waits for
active scopes it could replace; local work can proceed in another scope.

Callback cleanup and explicit animation cancellation belong to each native
handle and survive boundary unmount. Passive work belongs to the shared commit
and is released when its animations finish or that commit is interrupted.
Identity checks prevent an old completion from clearing a newer handle.

## Deliberate scope limits

- Gesture transitions remain deferred until React stabilizes their API.
- React Server Components, class components, and React Native are outside
  Octane's supported rendering model.
- Reduced-motion behavior remains application CSS, as in React.
- `scope="element"` is an Octane extension, with document behavior remaining the
  default. Unsupported or invalid element scopes commit without animation.
- Keyed reconciliation retains Octane's LIS algorithm. Only ViewTransition
  preparation uses staged DOM publication.

See [the public guide](view-transitions.md) for usage and observable behavior.
