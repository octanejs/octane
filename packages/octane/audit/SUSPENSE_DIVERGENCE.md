# Suspense Divergences from React

A registry of intentional differences, closed compatibility gaps, and known
limitations between Octane's Suspense implementation and React's. Each entry
distinguishes its status and cites the relevant evidence. A documented open bug
is not an intentional divergence.

Last reviewed against React 19 contracts.

---

## 1. Entangled-transition partial-commit — ✅ CLOSED for fully staged reveals

**Where it shows up:** [transitions.test.ts](__tests__/transitions.test.ts) —
`'entangles sibling boundaries: holds ALL prior content until every sibling resolves,
then reveals together'`; [conformance/entangled-commit.test.ts](__tests__/conformance/entangled-commit.test.ts).

**React behavior:** When a single `startTransition(fn)` causes multiple sibling
Suspense boundaries to suspend, React holds the prior DOM of EVERY sibling until ALL
their promises resolve, then reveals them together — never a half-updated screen
mid-transition.

**octane matches for fully staged reveals** via commit coordination (`HELD_TRANSITIONS` /
`STAGED_REVEALS` in runtime.ts): a boundary holding prior content for an in-flight
transition does not reveal as soon as one input resolves. Once fallback is visible,
Octane retries the detached primary under capture and stages it only after the entire
body completes; exact set membership then flushes every staged member's DOM, refs, and
layout effects in one tree-ordered batch. Superseding inputs invalidate stale readiness,
and abandon paths remove the boundary so siblings are not stranded. A pre-timeout live
retry can still discover a later dependent suspension while committing; that is the
global-WIP limitation retained in #4, not covered by this closed fallback-visible case.

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
but the OBSERVABLE cross-boundary gap is closed for fully staged regions: after fallbacks
are visible, the coordinator (Divergence #1) retries detached primaries to completion and
reveals their DOM plus ref/layout lifecycle in one batch. Independent per-swap WIPs also
retain their old content until ready (`entangled-commit.test.ts`).

**Binding tear inside a held boundary — CLOSED (2026-07-29).** A same-identity parent used
to patch its own bindings on the way down and only then have a descendant throw, so the
boundary held old content beside already-updated markup of its own. A pre-timeout live
retry had the same shape: resolve one use(), patch, then suspend on a later true
dependency. Both now run inside a journal (`TRANSITION_JOURNAL` in runtime.ts) that records
what each binding write replaced — plus the compiled bag that guards it, or the guard would
skip the re-patch on resume — and replays it if the attempt suspends into a hold. The undo
happens in the flush that made the change, so no intermediate state is ever painted.
`benchmarks/async-composition` pins the update at zero exposed states, level with React;
`transitions.test.ts` covers the in-place and replay shapes.

Controlled `value`/`checked`/`selected` are covered as of 2026-07-29 as well. Each needs
more than the node: the `default*` mirror and the per-element record of what was last
projected go back with it, or the record would believe the new value had already landed and
skip re-projecting it on resume.

**Remaining limitation — general transition-wide work in progress.** Outside the supported
single-origin staged-state path, content patched outside a suspended boundary, or a
structural change above it, can still commit early. These were originally filed as separate
gaps. The following investigation motivated the staged-state implementation described below:

1. _Reveal scope._ Reverting content outside the boundary strands it. The reveal path
   re-renders the try block only, so a restored bag outside it is never re-patched and the
   content stays on the old value permanently. The hold would have to record the block the
   transition originated from and re-render that instead.
2. _Destruction is not undoable_ — ✅ CLOSED for keyed lists (2026-07-29), extended by
   root transactions (#10). A keyed removal used to dispose the row before the hold was
   decided. The original boundary journal parked detached nodes and deferred teardown;
   root transactions now keep outgoing rows connected until commit, so a failed attempt
   does not blur a focused input. Rollback restores membership, order, state, and `@empty`
   together; successful deletion runs cleanup while the old DOM is still connected.
   Structural snapshots are taken only when membership or order changes.

   For the supported single-origin transition path, a value-position array-to-text
   replacement also keeps committed rows live until it can commit. The regression
   `keeps array content mounted until a suspended text replacement is ready` in
   `transitions.test.ts` verifies row/input identity, edited uncontrolled values, stable
   refs, and no cleanup during the hold. Successful replacement clears the refs and runs
   each row's cleanup once. Real-browser root tests additionally cover native focus events
   for keyed removal and the rows-to-`@empty` change.

Effects are the third piece: a rolled-back region outside a boundary would otherwise run
effects against DOM that was reverted underneath them, so that region needs the same
capture-and-splice treatment the resume path already uses.

**Attempted 2026-07-29, and the blocker is `isPending`.** A whole-drain "transition attempt"
was built — journal armed for the queued transition render, live effect/ref/store queues
marked and rewound, effect dependency cells restored, and the reveal replaying from the
block the attempt started at rather than from the boundary. Everything held together except
one thing: rolling the attempt back also reverted `isPending`, turning the pending cue
straight back off. Fifteen existing transition tests caught it.

The cause is deliberate and is spelled out at `startTransition` in runtime.ts: the priority
flag is raised BEFORE `tickTransitionCount`, _"so any scheduleRender calls fired by the
listener notification (and by fn itself) are tagged as transition"_. The pending cue is
therefore transition-priority work in the same block as the content it describes, and in
octane both are one render pass. Skipping urgent writes inside an attempt does not help,
because the cue render is not urgent. Re-rendering after the unwind to restore the cue
re-applies the content it was supposed to hold.

React does not have this problem: `isPending` commits in a separate pass at a different
priority from the transition itself.

~~So the prerequisite is decoupling the pending cue from the transition render.~~
**Corrected 2026-07-29**: that diagnosis named the wrong lever. `AsyncActionKeepsCommittedState`
already renders `pending` beside old content in one transition-tagged render — cell STAGING
separates cue from content, not priority. The cue's storage (`slotRef.isPending`) survives any
rollback; only its rendered bindings revert, and an urgent re-render with the content cells
reverted re-publishes exactly those bindings (everything else no-ops on its bag guard). The
actual prerequisite is extending the async-Action staging batch to held synchronous
transitions. Design and phases: [docs/transition-deferred-commit-plan.md](../../docs/transition-deferred-commit-plan.md).

Single-origin synchronous state staging subsequently shipped with cell rollback and an
old-input pending-cue render; see
[P1 landed](../../../docs/transition-deferred-commit-plan.md#p1-landed-2026-07-30-design-a--harvest).
Root-owned holds in #10 now use that staging contract too. This is not a general
multi-origin or external-store work-in-progress tree. Fallback-visible retries are
capture-safe and never had this limitation.
Time-based cross-boundary fallback throttling is the separate Divergence #5.

---

## 5. Retry reveal throttling — distinct from transition shell retention

**Correction (2026-08-21):** the previous dismissal was incorrect. An immediate
reveal inside React's `act()` does not establish production timing: React
explicitly bypasses its retry delay inside development `act()` scopes
([stable source](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1405-L1428)).
`alwaysThrottleRetries` is enabled in the pinned
[stable flags](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/shared/ReactFeatureFlags.js#L128)
and [canary flags](https://github.com/facebook/react/blob/b740af2510de1e19fcb399abb862af26ff95ac80/packages/shared/ReactFeatureFlags.js#L126),
not disabled by default.

**React behavior:** retry-only commits use a renderer-wide 300ms window from the
most recent fallback show or fill. A retry waits for the remaining window when
more than 10ms remains; urgent updates are not retry-only work. This can retain
an outer fallback while a retry discovers a new nested fallback, or briefly
retain a fallback whose data has already resolved. It does not impose a
deadline on already-visible content held by a transition (see #8).
The stable and canary work loops implement this policy
([stable](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1424-L1487),
[canary](https://github.com/facebook/react/blob/b740af2510de1e19fcb399abb862af26ff95ac80/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1489-L1552)).

**Octane behavior:** a shared recent-fallback timestamp coordinates retry-only
work, with one coalesced retry timer per root. Actual fallback show/fill commits
advance the timestamp; rendering the same fallback again does not. A later
fallback commit in a different root does not move an already scheduled timer.
Committed fallbacks under a hidden `<Activity>` also advance the timestamp;
hiding or revealing Activity by itself does not. The timing tests drain hidden
prerender work before advancing the clock so its initial fallback commit cannot
be mistaken for a later Activity visibility change.
Urgent updates and active `act()` scopes bypass the delay, and stale retries
are discarded when their inputs are superseded or their boundary unmounts.
This is a commit-timing policy, not an implementation of React's lanes or
time-sliced work loop.

**Evidence:**
[differential/suspense-timing.test.ts](../tests/differential/suspense-timing.test.ts)
drives the same fixture and clock against React and Octane, outside `act()` for
timing assertions. Existing `act()`-driven nested-reveal tests remain useful for
eventual output but are not evidence that production retry commits are immediate.

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

## 8. Transition shell retention — no fallback timeout by default

**React behavior:** a transition that suspends on already-visible content keeps
that content visible indefinitely. This is distinct from retry throttling in #5:
the transition does not replace the visible shell with a fallback just because
time has passed. The production work loop explicitly returns without scheduling
a timeout for this case
([stable source](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1356-L1369)).
Initial content and newly added nested boundaries can show their own fallbacks
because they do not replace previously visible content
([shell distinction](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-reconciler/src/ReactFiberWorkLoop.js#L2358-L2375)).

**Octane behavior:** `getTransitionFallbackTimeout()` defaults to `Infinity`.
Already-visible content remains connected and visible, and `isPending` stays
true until completion or urgent supersession. Entangled sibling boundaries
retain their previous content until they can reveal together.
Unmounting a held boundary releases its pending lifetime as well as canceling
its late retries and timeout, so later transitions do not remain stuck pending.

**Explicit extension:** `setTransitionFallbackTimeout(ms)` still allows a finite
deadline. Once that deadline expires, the boundary shows its pending fallback
while retaining the connected hidden primary; `isPending` stays true until the
transition resolves. This is an opt-in Octane behavior, not React's default.
The previous claim that a five-second default matched React was incorrect.

**Evidence:** [transition-timeout.test.ts](../tests/transition-timeout.test.ts)
checks default retention through 100000ms via `useTransition` and standalone
`startTransition` around both `root.render` and `useState` updates. It covers
pending state and DOM identity, eventual reveal, entangled sibling completion,
urgent supersession, initial and new nested fallbacks, and finite-timeout
resolve/unmount cleanup.

---

## 9. Resource-thrown thenables — render suspension gap closed

**React behavior:** a resource reader can suspend by throwing a thenable during
render, without calling `use()`. The surrounding Suspense boundary retries when
that thenable settles. A real error from the retry goes to the error boundary;
a thenable thrown by a commit-phase effect is an error, not render suspension.

**Octane behavior:** client and server render catches recognize resource-thrown
thenables as suspension. The client retries through the nearest pending boundary,
or through the root when no pending boundary owns the suspension (see #10).
Catch-only error boundaries do not claim thenables. SSR registers the pending
boundary without inventing a `use()` slot or hydration seed for the resource
reader. Native promises and custom thenables are covered.

Pending and error fallbacks are render work too. A wakeable thrown there suspends
to an enclosing Suspense boundary, or the client root if none exists, rather than
entering the fallback's own catch arm or destroying its state. This follows React's
[fallback-handler context](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-reconciler/src/ReactFiberSuspenseContext.js#L102-L107).
An error report produced by a detached retry stays deferred while its error
fallback is suspended; replacement or unmount cancels that report. Finite-timeout
fallbacks use the priority of the fallback render, not the earlier transition.
On the server, a completed primary does not wait for an obsolete pending fallback
that throws a raw wakeable.

**Evidence:** [suspense.test.ts](../tests/suspense.test.ts) covers raw resource
reads, resolution, rejection, and the effect-throw error control;
[differential/suspense-timing.test.ts](../tests/differential/suspense-timing.test.ts)
checks retry timing, suspending fallback state, rejection, and deferred error
reporting against React. [boundary.test.ts](../tests/boundary.test.ts) also covers
the literal imported JSX ErrorBoundary, and
[transition-timeout.test.ts](../tests/transition-timeout.test.ts) covers a suspending
fallback at an explicit finite deadline. Finally,
[ssr-suspense.test.ts](../tests/ssr-suspense.test.ts) covers buffered and streamed
rendering, sequential wakeables, rejection, abort, and hydration adoption.

---

## 10. Client suspension without a boundary — root hold and retry

Client roots now retain and retry render suspension from `use()` and
resource-thrown thenables when no Suspense/`@pending` boundary owns it, fixing
[issue #821](https://github.com/octanejs/octane/issues/821). A catch-only error
boundary does not own suspension. An initial client mount stays empty; an urgent
or transition update retains the previously committed screen while pending.
The retained screen keeps its node identity, component state, controlled values,
handlers, refs, and layout/passive effects. Replacement components, branches,
lists, rendered values, and portals wait for a successful root render before
replacing committed content.

Retries use the latest inputs. Superseding requests and unmounts cancel stale
reveals, and an uncommitted initial root initializes state from its current props
on retry. A rejected resource reports the actual error through the ordinary
error boundary or root callback; a thenable thrown by an effect remains an
application error rather than render suspension.

Initially suspended hydration retains the server DOM without attaching the
incomplete tree's refs or running its layout/passive effects. A successful retry
adopts the existing nodes; an unmount or superseding client render cannot revive
the abandoned hydration.

**Evidence:** the root-suspension group in
[differential/suspense-timing.test.ts](../tests/differential/suspense-timing.test.ts)
runs the same compiled fixtures and public descriptor interactions against
ReactDOM 19.2.7 and both Octane compile modes. It covers raw and `use()` reads,
initial and committed roots, urgent/transition and descendant updates, structural
replacement, controlled inputs, event handlers, retained state/context, refs and
effects, latest-input supersession, rejection, repeated/custom/synchronous
thenables, independent roots, and unmount. The root-suspension group in
[hydration/suspense-hydrate.test.ts](../tests/hydration/suspense-hydrate.test.ts)
checks server-node adoption, subsequent suspended updates, rejection,
supersession, and unmount in both compile modes.

Pending-cue and commit-time evidence covers single-origin root suspension, including
successive resources, unrelated props refreshes, cancellation, and rejection. This matrix
does not establish simultaneous explicit-boundary/root holds, multi-origin staging, or
external-store-driven transition behavior. That proof limit is separate from the retained
root-output guarantees above.

These are retained-output and committed-lifecycle guarantees, not a claim that
every eager native host mutation has React's separate render/commit semantics.
The broader work-in-progress limitations in #4 remain separate.

The measured ordinary-render overhead, executable bundle growth, affected-path
work counts, and remaining measurement limits are recorded in the
[root suspension performance audit](./root-suspension-performance.md).

---

## 11. Incomplete descriptor retry bailouts

Previously, incoming descriptor props could become the bailout comparison before
their render completed. A retry then removed the fallback but revealed the old
value. [Issue #825](https://github.com/octanejs/octane/issues/825) reproduces this
with public `createElement` and `use`, without a compiler or error boundary.

Render validity is now independent of mount lifetime. Failed paths and bodies
whose speculative commit work was discarded must run again, including through
memoized ancestors and compiler-cached output. Successful, unaffected memo and
identity bailouts remain eligible. Revalidation stays local to the active render;
one root's suspension does not invalidate another root's output-cache epoch.

[Differential tests](../tests/differential/suspense-timing.test.ts) compare native
promise updates with React in development and production: repeated suspension,
later-sibling completion, committed refs/effects, supersession, rejection, unmount,
independent roots, and held descriptor text/prop rollback. The
[hydration test](../tests/hydration/suspense-hydrate.test.ts) preserves adopted DOM
and edited state through a suspended update. The related initially-hidden
Activity case is covered by [Activity lifecycle tests](../tests/activity.test.ts).
Costs and limitations are recorded in the
[performance audit](./incomplete-descriptor-retry-performance.md).

Root-owned suspension without a pending boundary is covered separately in #10.
Descriptor retry validity does not add general React-style work-in-progress
semantics (#4) or general replay of discarded caught-error reports.

## 12. Ordinary first-mount error reporting

[PR #828](https://github.com/octanejs/octane/pull/828) fixed
[issue #824](https://github.com/octanejs/octane/issues/824): ordinary non-suspending
first-mount and parent-driven catches report the original error once after the
fallback's refs and layout effects commit. Existing scheduled-error reporting is
unchanged. [Root callback tests](../tests/root-error-callbacks.test.ts) cover the
public descriptor, JSX, and template forms; this does not claim general
transactional reporting for a catch abandoned by a later suspension.

---

## What we DO match React on (for the record)

The tests below cover established Suspense, transition, and deferred-value
contracts. They are not an exhaustive claim that every React scheduling or
Suspense behavior has been implemented:

- Basic suspend → pending → resolve cycle.
- `use(promise)` thenable cache (same promise reads the cached value
  synchronously).
- Resource readers throwing thenables during render suspend inside an enclosing
  boundary on the client and server (see #9; the client root gap is #10).
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
- Entangled fallback-visible reveal: one `startTransition` that fans out to multiple
  suspending boundaries holds each fallback until every detached primary fully stages,
  then reveals their DOM/ref/layout lifecycle together (coordinator; Divergence #1/#4).
  Pre-timeout live retries and global parent/sibling rollback retain #4's limitation.
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
- Transition shell retention has no fallback deadline by default. A finite
  `setTransitionFallbackTimeout` is an explicit Octane extension (see #8).
- Retry-only reveals respect the shared 300ms fallback window outside `act()`;
  urgent updates and active `act()` scopes do not wait (see #5). An outer reveal
  may include resolved content and a still-pending inner fallback in one commit,
  but promise resolution alone does not guarantee that commit is immediate.

A divergence not listed here is a bug. File it.
