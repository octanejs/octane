# Suspense Divergences from React

A registry of intentional behavior differences between octane's Suspense
implementation and React's. Each entry cites the test that pins the divergence so
a future runtime change either updates this document OR removes the divergence by
closing the gap.

Last reviewed against React 19 contracts.

---

## 1. Entangled-transition partial-commit — ✅ CLOSED

**Where it shows up:** [transitions.test.ts](__tests__/transitions.test.ts) —
`'entangles sibling boundaries: holds ALL prior content until every sibling resolves,
then reveals together'`; [conformance/entangled-commit.test.ts](__tests__/conformance/entangled-commit.test.ts).

**React behavior:** When a single `startTransition(fn)` causes multiple sibling
Suspense boundaries to suspend, React holds the prior DOM of EVERY sibling until ALL
their promises resolve, then reveals them together — never a half-updated screen
mid-transition.

**octane now matches** via global commit coordination (`HELD_TRANSITIONS` /
`STAGED_REVEALS` in runtime.ts): a boundary holding prior content for an in-flight
transition does NOT reveal when its own promise resolves — it stages and waits until
EVERY held boundary in the transition is data-ready (`STAGED_REVEALS.size ===
HELD_TRANSITIONS.size`), then `flushStagedReveals` commits them all in one batch. The
hold (and thus `isPending`) stays up until that batch. Abandoning a held boundary
(urgent supersede / error / unmount) drops it from the group so the rest aren't
stranded. This also closes #4's observable cross-boundary-reveal gap.

---

## 2. `@catch (err, reset)` syntax vs React's `<ErrorBoundary>` API

**Where it shows up:** [suspense.test.ts](__tests__/suspense.test.ts) —
`'catch reset() retries the try body with the latest props'`

**React behavior:** React's error boundary contract uses a `<ErrorBoundary>`
component (typically third-party like `react-error-boundary`) with `resetKeys`,
`onReset`, or an externally-supplied `resetErrorBoundary` callback.

**octane behavior:** The `@catch (err, reset)` positional `reset` is an
octane-specific TSRX syntax — same intent (retry the failed branch with fresh
state), different surface.

**Surface impact:** None at runtime. This is API-shape divergence only; the
underlying error-boundary mechanics are equivalent.

**Closure plan:** Not closeable without abandoning TSRX directive syntax. Will
remain as a documented surface difference.

---

## 3. Sequential `use()` waterfall — regression pin, not parity divergence

**Where it shows up:** [suspense.test.ts](__tests__/suspense.test.ts) —
`'WITHOUT useMemo, sequential use() inside one body waterfalls (documents the gotcha)'`

**Status:** This is NOT a divergence from React per se. React's runtime also
waterfalls in this pattern (the first `use()` must resolve before the body re-runs
past it). The test pins octane's specific per-replay call-count behavior so a
future optimization can't accidentally change it without a deliberate decision.

**Surface impact:** N/A — this is a regression-pin, not a divergence.

**Closure plan:** No closure needed. Test exists to defend the current contract.

---

## 4. Per-swap off-screen rendering — cross-boundary reveal gap ✅ CLOSED

**Where it shows up:**
[differential/transition-swap-suspend.test.ts](__tests__/differential/transition-swap-suspend.test.ts),
[differential/transition-swap-child.test.ts](__tests__/differential/transition-swap-child.test.ts),
[conformance/entangled-commit.test.ts](__tests__/conformance/entangled-commit.test.ts),
and `@octanejs/tanstack-router`'s concurrent-navigation hold.

**React behavior:** A transition renders the ENTIRE work-in-progress tree off the
current one and commits it atomically. If one transition fans out to several
independent suspending regions, React holds ALL their prior content and reveals them
together.

**octane behavior:** octane renders **per swap site** (`componentSlot`/`childSlot`/
`ifBlock`/`switchBlock`): the new subtree renders off-screen (effects captured),
commits atomically on completion, or — on suspend — is discarded with the suspend
re-thrown so the enclosing `@try` holds the OLD subtree live and resumes on settle.
The IMPLEMENTATION is still per-swap off-screen (not one global double-buffered tree),
but the OBSERVABLE cross-boundary gap is now closed: a transition that fans out to
several suspending regions no longer reveals them piecewise — the global commit
coordinator (Divergence #1) holds every region's prior content and reveals them
together once all are data-ready (`entangled-commit.test.ts` exercises two off-screen
if-block swaps in one transition revealing together, effects firing in one batch).

**Remaining limitation:** this is still not a global WIP. During an ordinary synchronous
transition, a same-identity parent can patch bindings outside a suspending `@try` before a
descendant throws. octane then holds the old boundary content beside already-updated
parent/sibling UI; React retains the whole prior screen. The async Action batching in #6
prevents that tear while an Action is in flight, but does not close the synchronous case.
Time-based cross-boundary fallback throttling is the separate Divergence #5.

---

## 5. Reveal throttling (`FALLBACK_THROTTLE_MS`) — NOT a default-React divergence

**Status:** Investigated and dismissed — octane already matches React's DEFAULT behavior;
the throttle is non-default. (Earlier this was provisionally filed as a divergence using
the WRONG oracle — the `-test.internal.js` suite, which runs with internal flags.)

**The evidence:** the public, default-flags test `ReactUse-test.js:1096` ("load multiple
nested Suspense boundaries") — outer `(Loading A...)`, resolve A while inner B suspends —
asserts `toMatchRenderedOutput('A(Loading B...)')`. React reveals A and shows the inner
fallback IMMEDIATELY; it does NOT hold the outer fallback. octane does exactly the same
(`conformance`/`suspense.test.ts` "inner Suspense reveals AFTER outer resolves", ported
from that test, passes). The throttling behavior (`ReactSuspense-test.internal.js:267`
"throttles fallback committing globally") lives in the internal suite, and the related
retry-throttle assertions are gated behind `gate('alwaysThrottleRetries')` — a feature
flag that is OFF by default (`ReactSuspenseWithNoopRenderer-test.js:1778` spells this out:
"Old behavior, gated until this rolls out at Meta"). `FALLBACK_THROTTLE_MS` only forces a
delay when `alwaysThrottleRetries || exitStatus === RootSuspended`
(`ReactFiberWorkLoop.js:1426`), which does not fire for the default nested-reveal path.

**Conclusion:** implementing the cross-boundary fallback throttle would make octane DIVERGE
from default React (and break the correctly-ported `ReactUse:1096` test). It is therefore
intentionally NOT implemented. If React flips `alwaysThrottleRetries` on by default in a
future release, revisit — it could layer on the existing commit coordinator as a shared
`FALLBACK_THROTTLE_MS` timer.

---

## 6. Async-action transition entanglement (intermediate commits) — ✅ CLOSED (2026-07-14)

**Where it shows up:** `ReactAsyncActions-test.js:352` ("urgent updates are not blocked
during an async action") and [transitions.test.ts](../tests/transitions.test.ts) —
`'keeps parent state and suspended child on the committed screen until the Action settles'`.
A `startTransition(() => setX(1))` nested INSIDE an in-flight
`startTransition(async () => …)` keeps `X` on its OLD value until the async action's
promise settles, then commits with the rest of the action.

**React behavior:** an async action is one atomic transition — every transition-priority
update made while it is in flight is entangled and deferred, committing together when the
action settles. Urgent updates made meanwhile are NOT blocked (they commit immediately).

**octane now matches:** a `TransitionActionBatch` stages ordinary `useState` and
`useReducer` updates until every entangled async Action settles. Explicit transitions
started after `await` join the same batch; discrete urgent updates bypass it and staged
functional updates rebase over them at commit. `useOptimistic` deliberately remains the
visible in-flight surface. The regression covers parent state, reducer state, a suspending
child with no fallback flash, post-`await` entanglement, and urgent-update rebasing.

---

## 7. `useInsertionEffect` is toggled by `<Activity>` hide/show — ✅ CLOSED (2026-07-04)

**Where it shows up:** `Activity-test.js:1428` ("insertion effects are not disconnected
when the visibility changes"); pinned by
[activity.test.ts](__tests__/activity.test.ts) — the "insertion effects stay
connected while hidden" conformance pair.

**React behavior:** hiding an `<Activity>` destroys its layout + passive effects but NOT
its insertion effects (they stay connected); an update WHILE hidden still fires insertion
effects (the subtree is pre-rendered). Insertion effects are for injecting styles, which
should persist while a tab is merely hidden.

**octane now matches:** each `EffectSlot` records its phase, and the hide machinery
singles `INSERTION` out — `deactivateScope` skips its cleanup AND keeps its deps (so
reveal doesn't re-fire it), while `enqueueEffect`/`drainPhase`'s inactive gates exempt
it (so a deps-changed update while hidden still cycles it). A real unmount still tears
it down via the scope finalizer. The exemption applies to both hide paths that share
`deactivateScope` (Activity hide AND suspense-hide), matching React's Offscreen
semantics — insertion effects only unmount on deletion.

---

## What we DO match React on (for the record)

The list above is the complete known set of Suspense-related divergences. Every
other Suspense / Transitions / Deferred test pins a contract we EXACTLY match
React on, including:

- Basic suspend → pending → resolve cycle.
- `use(promise)` thenable cache (same promise reads the cached value
  synchronously).
- `use(Context)` overload.
- `use(unsupported)` throws the invariant.
- Synchronous render throw routes to `@catch` with identical surface as a rejected
  promise.
- Nested boundary innermost-catches-first.
- Outer-then-inner reveal sequencing in nested boundaries.
- Effects skipped while pending; fired on resolve.
- Hooks ABOVE `use()` preserved across replay (useState, useReducer, useRef,
  useMemo identity).
- Hooks BELOW `use()` not registered until resolve.
- `use()` inside `@if` branches (conditional `use()` is legal).
- Same promise read twice returns same value via per-fiber cache.
- Sibling boundaries on a shared promise commit in the same frame.
- Unmounting a suspended boundary mid-pending cancels the retry cleanly (no late
  commits).
- Entangled-boundary reveal: one `startTransition` that fans out to multiple suspending
  boundaries holds each boundary's prior content until all are data-ready, then reveals
  them together (global commit coordinator; Divergence #1/#4). This does not imply global
  parent/sibling rollback; see #4's remaining synchronous limitation.
- Async Action entanglement: ordinary state/reducer updates stay staged until the Action
  settles, post-`await` explicit transitions join the batch, and urgent discrete updates
  still commit immediately (`transitions.test.ts`; Divergence #6).
- `useOptimistic` rebasing: the optimistic value folds the pending queue onto the CURRENT
  passthrough each render, so a passthrough change mid-action rebases the pending update;
  custom reducers and repeated updates in one action work too (`ReactAsyncActions-test.js`
  :685/:887/:1141, `conformance/async-actions.test.ts`).
- `<Activity>`: revealing an outer boundary does NOT mount a still-hidden inner one
  (`Activity-test.js:1362`); layout/passive effects mount child-first and tear down
  parent-first on hide (`Activity-test.js`); state + DOM preserved across hide/show — all
  in `activity.test.ts`, including insertion effects remaining connected while hidden
  (closed Divergence #7).
- Transition prior-DOM preservation inside the suspending boundary (IN-PLACE re-suspend).
- Transition REPLACE-suspend hold: swapping in a different component/branch that
  suspends on mount keeps the prior content on screen (per-swap off-screen WIP — see
  Divergence #4 for the single- vs multi-boundary scope).
- Effect lifecycle under suspense: a re-suspended boundary's committed layout/passive
  effects are DESTROYED while it shows the fallback and RECREATED on reveal (state is
  still preserved); they are destroyed exactly ONCE when the boundary suspends in
  multiple places (a partial resolve that stays suspended does not re-destroy/recreate),
  and a nested inner-boundary re-suspend destroys only the inner subtree's effects —
  `ReactSuspenseEffectsSemantics-test.js:611/:2438/:1138`,
  `conformance/suspense-effects-semantics.test.ts`.
- Host refs under suspense: a suspended boundary's host refs are DETACHED on hide
  (object refs → null, callback refs called with null) and re-attached on reveal — React
  cycles refs like layout effects even though the DOM node is preserved. Covers the
  compiled template host-ref path, de-opt host slots, AND (since 2026-07-04) the
  closure-attached flavors: refs inside a SPREAD (`_sp$N` bindings), `<Fragment ref>`
  (FragmentInstance), and refs on value-position pure-host descriptors (the de-opt
  DEOPT_DESC walk, nested elements included);
  `ReactSuspenseEffectsSemantics-test.js:2877`, `conformance/suspense-refs.test.ts`.
- `useDeferredValue` identity stability.
- `useDeferredValue(value, initialValue)` React-19 overload.
- `useTransition` rising/falling `isPending` edges.
- Standalone `startTransition` parity with hook form.
- Nested `useTransition` (independent `isPending` flags).
- Urgent-supersedes-transition discard.
- Transition-fallback timeout (`setTransitionFallbackTimeout`, default 5s —
  matches React).
- Reveal timing matches React's DEFAULT: content reveals immediately when its promise
  resolves, including the nested case — revealing an outer boundary shows resolved content
  AND the inner boundary's fallback in the same commit (`ReactUse-test.js:1096`
  `'A(Loading B...)'`). React's cross-boundary fallback throttle is `alwaysThrottleRetries`-
  gated (OFF by default), so octane intentionally does not throttle (see dismissed #5).

A divergence not listed here is a bug. File it.
