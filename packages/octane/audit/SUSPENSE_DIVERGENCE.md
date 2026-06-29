# Suspense Divergences from React

A registry of intentional behavior differences between octane's Suspense
implementation and React's. Each entry cites the test that pins the divergence so
a future runtime change either updates this document OR removes the divergence by
closing the gap.

Last reviewed against React 19 contracts.

---

## 1. Entangled-transition partial-commit

**Where it shows up:** [transitions.test.ts](__tests__/transitions.test.ts) —
`'entangles sibling boundaries: isPending stays true until ALL siblings resolve'`

**React behavior:** When a single `startTransition(fn)` causes multiple sibling
Suspense boundaries to suspend, React holds the prior DOM of EVERY sibling until
ALL their promises resolve. The user never sees a half-updated screen
mid-transition.

**octane behavior:** We eagerly commit each sibling as its individual promise
resolves. `isPending` correctly stays true until both resolve (we match React on
the counter contract and on prior-DOM-preservation per-sibling). What we diverge
on is the per-sibling commit timing inside the transition window.

**Surface impact:** Low. The user sees content appear earlier than React would
render it — generally fine for non-coordinated siblings, mildly surprising when
siblings are visually entangled.

**Closure plan:** Tracking entangled siblings as a coordinated group requires
plumbing transition identity through every tryBlock that participates. ~200 lines
runtime work, no API surface change. Filed as a follow-up.

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

## 4. Per-swap off-screen rendering (not a global double-buffered WIP tree)

**Where it shows up:**
[differential/transition-swap-suspend.test.ts](__tests__/differential/transition-swap-suspend.test.ts),
[differential/transition-swap-child.test.ts](__tests__/differential/transition-swap-child.test.ts),
and `@octanejs/router`'s concurrent-navigation hold.

**React behavior:** A transition renders the ENTIRE work-in-progress tree off the
current one and commits it atomically. If one transition fans out to several
independent suspending regions, React holds ALL their prior content and reveals them
together.

**octane behavior:** octane renders in place, so the transition replace-suspend hold
is implemented **per swap site** (`componentSlot`/`childSlot`/`ifBlock`/`switchBlock`):
the new subtree is rendered off-screen (effects captured), committed atomically on
completion, or — on suspend — discarded with the suspend re-thrown so the enclosing
`@try` holds the OLD subtree live and resumes on settle. For the single-boundary case
(route/tab/query-key changes — the dominant shape) this matches React's observable
behavior exactly: no blank flash, `isPending` true once, fallback only after the
timeout, effects fire only after the new subtree connects. What it does NOT give is
cross-boundary all-or-nothing commit: a transition that suspends in one region while a
sibling region completes will reveal the sibling immediately rather than waiting for
both. This is the same family as Divergence #1 (per-boundary, not coordinated commit).

**Surface impact:** Low. Only observable when one transition updates multiple
independent suspending regions at once.

**Closure plan:** A true global WIP tree (interruptible, double-buffered, coordinated
commit + fallback throttling) is a much larger runtime effort, scoped out for now
alongside the other advanced-scheduling items in the parity plan §2/Tier 5–6.

---

## 5. Reveal throttling (`FALLBACK_THROTTLE_MS`) — cross-boundary only

**Where it shows up:** `ReactSuspense-test.internal.js:267` ("throttles fallback
committing globally"), `ReactSuspenseWithNoopRenderer-test.js:1778/:1857`,
`ReactFiberWorkLoop.js` (`FALLBACK_THROTTLE_MS = 300`, `globalMostRecentFallbackTime`).

**React behavior:** React keeps a GLOBAL clock of when a fallback was last shown. When a
commit would reveal content that still exposes a DIFFERENT (e.g. nested) fallback, and
the previous fallback appeared < 300ms ago, React delays that commit — holding the prior
fallback so loading states don't flicker/stagger. (The single-boundary
fallback→content retry throttle is separately gated behind `alwaysThrottleRetries`, OFF
by default.)

**octane behavior:** octane MATCHES React's DEFAULT for a single boundary — content
reveals immediately when its promise resolves (verified: `Loading` → `A1`, no artificial
delay). What octane does NOT do is the CROSS-boundary throttle: in a nested
`@try { <A/> @try { <B/> } @pending {…inner…} } @pending {…outer…}`, resolving `A` while
`B` is still pending reveals `A` + the inner fallback immediately (octane shows
`A1LoadingMore`), whereas React holds the outer `Loading` until `B` resolves or the 300ms
window elapses.

**Surface impact:** Low. Only observable with nested boundaries whose inner content
suspends right as the outer reveals — the user may see one extra intermediate loading
state that React would have coalesced.

**Closure plan:** This is the same family as Divergence #1 (entangled-transition
partial-commit) and #4 (per-swap, not global-WIP, off-screen rendering). React can defer
the WHOLE commit against a global clock; octane commits per-boundary IN PLACE, so there
is no global commit to hold back — matching it needs the global, coordinated, double-
buffered commit (#4's "true global WIP tree") plus a shared fallback clock. Scoped out
with the rest of the advanced-scheduling work (parity plan §2 / Tier 5–6).

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
- Transition prior-DOM preservation during suspense (IN-PLACE re-suspend).
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
  compiled template host-ref path and de-opt host slots;
  `ReactSuspenseEffectsSemantics-test.js:2877`, `conformance/suspense-refs.test.ts`.
  (NOTE — narrow limitation: refs attached purely through closures — prop spread, the
  de-opt prop path, fragment refs — are not yet cycled across a suspend.)
- `useDeferredValue` identity stability.
- `useDeferredValue(value, initialValue)` React-19 overload.
- `useTransition` rising/falling `isPending` edges.
- Standalone `startTransition` parity with hook form.
- Nested `useTransition` (independent `isPending` flags).
- Urgent-supersedes-transition discard.
- Transition-fallback timeout (`setTransitionFallbackTimeout`, default 5s —
  matches React).
- Single-boundary reveal timing: content reveals immediately when its promise resolves,
  matching React's DEFAULT (the per-boundary retry throttle is React-flag-gated off; the
  cross-boundary reveal throttle is Divergence #5).

A divergence not listed here is a bug. File it.
