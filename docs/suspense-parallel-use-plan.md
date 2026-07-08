# Parallel `use()`: killing suspense waterfalls with the compiler

> Produced 2026-07-08 from a three-track research pass (runtime deep-dive of
> `useThenable`/`handleSuspense`/`attachResume`, compiler deep-dive of the hook-slot
> and free-identifier machinery, and a primary-source prior-art survey of React
> `main`, Solid 2.0, Ripple, Svelte async, Vue, Qwik, Marko, Relay, and userland
> patterns). Status: **PLANNED, not built.** Line references are against the
> 2026-07-08 working tree and will drift; function names are the stable anchors.

## The problem

```tsx
const a = use(fetchA(id)); // throws SuspenseException while pending
const b = use(fetchB(id)); // ← never reached in this attempt
```

Octane inherits React's `use()` contract: a pending read throws, the throw aborts
the component function, and the body is replayed from the top when the promise
settles. That structure has two distinct costs:

1. **Network waterfall (the killer).** When the promise is *created* in the body,
   the second fetch does not even start until the first resolves. Latency becomes
   the *sum* of the fetches instead of the *max*. This is pinned today by the
   `WaterfallBody` regression test in `tests/suspense.test.ts` ("WITHOUT useMemo,
   sequential use() inside one body waterfalls") — documented there as a pin of
   the current sequential-replay strategy, **not** a React-canonical contract.
2. **Replay churn.** Even when both promises pre-exist (props/module scope — so
   both are in flight), `attachResume` wires the retry to the *first* thenable
   only. A resolves → replay → suspend on B → B resolves → replay again. N
   independent `use()` calls cost up to N replays and N suspend/retry cycles per
   suspension episode, on mount and on every update that swaps the promises.

Both costs bite hardest **on updates**, where new promises arrive via changed
props/state and the boundary re-suspends.

## Current mechanics (what the fix must integrate with)

Runtime (`packages/octane/src/runtime.ts`):

- `use()` (~2663) dispatches Context vs thenable; `useThenable()` (~2782) indexes
  thenables by **dynamic call order** (`block.__thenableIdx` into
  `block.__thenables`), tags `status`/`value`/`reason` on the thenable itself,
  and returns synchronously on replay when `stored === thenable`. Note the
  identity requirement: Octane has **no** React-style "reuse the stored thenable,
  drop the fresh one" leniency — a fresh promise at a replayed slot re-suspends
  (refetch-storm hazard for uncached creations).
- `SuspenseException` unwinds synchronously to the enclosing `tryBlock`'s
  `__suspenseHandler` (~8654) → `handleSuspense()` (~8741). No sibling
  prerendering: the rest of the body is simply not reached.
- `handleSuspense` implements React-18-style hold semantics: transition suspends
  keep prior DOM (`transitionHeld`, 5s fallback timeout via
  `swapToPendingFallback`), non-transition suspends swap to `@pending`.
- `attachResume()` (~9147) stores a **single** `state.pendingThenable` and wires
  `thenable.then(retry, retry)`; `commitResume()` (~8961) replays the try body
  (`renderBlock` with `__thenableIdx` reset) and re-enters `handleSuspense` if the
  replay suspends again.
- Precedent for batched wakeups exists at boundary granularity:
  `HELD_TRANSITIONS`/`STAGED_REVEALS` (~505, ~9125) commit all entangled
  boundaries of a transition atomically. Nothing batches *within* a boundary.
- Hydration: SSR-seeded `use()` values are adopted in **`use()` call order**
  (`hydrationSeeds`/`hydrationSeedCursor` in `useThenable`).

Compiler (`packages/octane/src/compiler/compile.js`):

- `rewriteHookCalls()` (~3204) appends a stable per-call-site symbol
  (`allocHookSymbol`, ~3965; `Symbol.for('octane:<file>:<comp>.<hook>#<n>')`) to
  built-in hooks and wraps custom hooks in `withSlot`. Client-mode `use` is NOT
  slot-wrapped today; server-mode `use` is (SSR suspense-cache key).
- `collectFreeIdentifiers()` (~841) does scope-aware binding resolution — it can
  answer "does expression E reference binding X" directly.
- Setup-statement transform passes already exist: the autoCallback pass
  (`computeStableLocals` + `rewriteAutoCallback`, ~3098) and early-exit rewriting
  (`rewriteEarlyExits`, ~7242). The insertion point for a new pass is
  `compileFunctionBody()` (~3056), after autoCallback, before `rewriteHookCalls`.
- Hook slots are symbol-keyed, not position-keyed — the conditional-hooks
  guarantee does not depend on statement order, so a reordering pass does not
  fight it.

## Prior art (why this design)

Primary-source findings; URLs carry the claims. (Quotes were machine-extracted;
spot-check before quoting them anywhere formal.)

- **React (verified against `facebook/react@main`).** The waterfall is
  structural: `use(pending)` throws the opaque `SuspenseException`
  (ReactFiberThenable.js); replay re-executes the whole body with index-keyed
  thenable memoization ("components are idempotent" — fresh promise at a replayed
  slot is dropped in favor of the stored one, with the dev warning "A component
  was suspended by an uncached promise…"). The `use` RFC
  (https://github.com/reactjs/rfcs/pull/229) never addresses intra-component
  waterfalls; the official answer is caching + "create promises before render"
  (https://react.dev/reference/react/use). React 19's sibling **pre-warming**
  (PR #30800, after the June-2024 #29898 regression controversy) speculatively
  renders skipped *sibling components* off-screen after the fallback commits — it
  never re-attempts past a suspended `use` within one component, and its extra
  speculative passes caused double-fetch complaints downstream (TanStack
  QueryStrictMode RFC, https://github.com/TanStack/query/discussions/8064).
- **Solid 2.0.** Fetches start eagerly at `createAsync` *creation* during
  run-once setup; a pending *read* throws `NotReadyError` at fine-grained node
  granularity and pending-ness propagates through the graph (each derived
  registers the dep, becomes pending itself). Two async reads in one scope →
  both fetches already in flight; the throw only delays *subscription*, and the
  replay scope is one tiny derived node. True A→B dependencies suspend/resume
  that one computation ("the primary async goal of Solid 2.0",
  https://github.com/solidjs/solid-router/discussions/375;
  https://dev.to/playfulprogramming/async-derivations-in-reactivity-ec5).
- **Ripple.** Two paths: plain body `await` compiles to a **real continuation**
  (suspend at the await, resume, no replay) — and is *sequential by design*;
  parallelism goes through `trackAsync`, which runs the fetcher eagerly in a
  `pre_effect` at creation and returns a `SUSPENSE_PENDING`-sentinel Tracked.
  Reading a pending Tracked throws and pauses only that fine-grained block. The
  `@try/@pending` boundary is a **request refcounter** (`pending_count`,
  `begin_request`/`complete_request`, re-render once at zero) with an
  `active_requests` set ignoring stale resolutions and
  `abort_controller.abort(TRACKED_UPDATED)` cancelling superseded fetches.
  Parallelism is test-proven (`tests/client/async-suspend.test.tsrx`: two
  `trackAsync`s go in-flight in the same render).
  (https://github.com/trueadm/ripple — `runtime/internal/client/try.js`,
  `runtime.js`.)
- **Svelte async** (`await` in `$derived`/templates, 5.36+ behind
  `experimental.async`; https://github.com/sveltejs/svelte/discussions/15845).
  Sequential template `await`s run in parallel because each `await`-bearing
  expression compiles to its own async derivation ("an async derived is really
  just an effect and a source signal in a trenchcoat") under an assumed purity of
  template expressions. Even Svelte does **no static dependency analysis**:
  script-level sequential awaits waterfall on first run, and the documented fix
  is manually splitting creation from awaiting. Ships a runtime
  `await_waterfall` dev warning.
- **Userland.** TanStack `useSuspenseQueries` ("with suspense, all your Queries
  inside one component are fetched in serial" — the plural hook is the fix,
  https://github.com/TanStack/query/discussions/5946); Apollo splits
  initiate/read (`useBackgroundQuery`/`useReadQuery`); `use(Promise.all([...]))`
  couples readiness and errors all-or-nothing.

**Synthesis.** Every shipped solution decouples *fetch start* (eager, at
creation) from *fetch read* (fine-grained, suspendable). Nobody parallelizes via
static dependency analysis — Solid/Ripple get it from run-once setup + eager
primitives, Svelte from graph concurrency under a purity assumption. Octane's
compiler can reconstruct the same property for React-shaped `use()` code by
*proving* independence instead of asking the developer to switch primitives.
That transform is genuinely novel, and it rests on the same idempotence
assumption React already bakes into `use()` replay.

## Options considered and rejected

| Option | Verdict |
|---|---|
| Runtime-only speculative execution past the throw (poisoned sentinel to discover later `use()` calls) | Rejected as primary mechanism. Crom-style speculation; unsound without purity proofs; React's far weaker prewarming already caused ecosystem double-fetch pain. Kept as optional Phase 5 research, compiler-gated. |
| Ripple-style continuation compilation of `@try` bodies | Rejected for this problem. Continuations fix *replay cost*, not waterfalls — Ripple's own body-`await` is sequential by design and routes parallelism through eager creation. Would be a major departure (hook/effect timing, sync-render guarantees, hydration) for no waterfall benefit. |
| `useAll([...])` / `use(Promise.all(...))` sugar | Rejected as the mechanism (all-or-nothing readiness, coupled rejection, per-value reveal lost). The runtime wakeup below borrows the shape while keeping per-value unwrapping. |
| Compiler preload transform + batched boundary wakeup | **Chosen.** Phases below. |

## The plan

### Phase 1 — Auto-memoize `use()` argument creations

Compile `use(<expr>)` where `<expr>` is a call/new/template of a non-trivial
expression into a slot-keyed memo of the creation, in place:

```js
// const a = use(fetchA(id));
const __p0 = useMemo(() => fetchA(id), [fetchA, id], _h$0);
const a = use(__p0);
```

- Dep arrays from the free variables of the expression (same oracle style as the
  autoCallback pass; see Decision point 3 for member-path granularity).
- Skip trivial arguments (identifiers, member reads): `use(props.promise)` and
  `use(SomeContext)` pass through untouched — this also sidesteps the
  cannot-statically-distinguish-Context problem.
- Skip `use()` calls inside loops until Decision point 2 (slot behavior in
  loops) is verified.
- Effect: refetch happens exactly when deps change; replays can never mint fresh
  promises; updates get stable identity for free.

**Runtime safety net (React parity), independent of the transform:** mark the
block as replaying during `commitResume` → `renderBlock`; in `useThenable`, if a
replay presents a *fresh* thenable at a slot with a stored one, reuse the stored
thenable, drop the fresh one, and emit React's "suspended by an uncached
promise" warning in dev. Closes the refetch-storm hazard for un-memoized code
(hand-written `use(fetch(...))` in bindings, pre-transform output, opted-out
files).

### Phase 2 — Parallel-start transform (the waterfall killer)

Within a single statement block (never across `@if`/plain-`if`/`@for`/loop
boundaries), find maximal runs of `use()` statements and hoist every
*independent* memoized creation above the first unwrap:

```js
// const a = use(fetchA(id));
// const b = use(fetchB(id));
// const c = use(fetchC(a.ref));        ← depends on a
const __p0 = useMemo(() => fetchA(id), [fetchA, id], _h$0);
const __p1 = useMemo(() => fetchB(id), [fetchB, id], _h$1);
const a = use(__p0);
const b = use(__p1);
const c = use(useMemo(() => fetchC(a.ref), [fetchC, a], _h$2)); // stays put
```

- **Legality:** a creation may hoist past `use(pA)` iff `collectFreeIdentifiers`
  shows it references neither `a` nor any intervening binding (transitively)
  derived from `a`.
- **Conservative intervening-statement rule (v1):** a run may span interleaved
  `const`/`let` declarations only when those declarations are themselves
  hoist-independent of the earlier `use` results; any other statement kind
  (calls, assignments, control flow, try/catch) terminates the run. Loosen
  later with a purity oracle if real code demands it.
- **Unwrap order is untouched** — only creation order changes. Hydration-seed
  adoption walks `use()` call order, so seed order is preserved by construction.
- **Semantic license:** evaluating `fetchB(id)` before A's unwrap reorders
  user-visible side effects of render code. This is the same idempotence
  assumption React states in `trackUsedThenable` and Svelte applies to template
  expressions. Document as an intentional divergence (see Phase 4): *Octane
  starts independent `use()` fetches in parallel; React waterfalls.*
- Multi-level chains shrink to their true dependency depth: each replay
  discovers (and batch-starts) the next *stratum* of creations, so a
  3-statement body with one real dependency costs 2 suspension rounds, not 3.

### Phase 3 — Batched unwrap: one replay per settled stratum

With creations hoisted, emit a batch marker before the unwraps:

```js
_$useBatch([__p0, __p1]);
const a = use(__p0);
const b = use(__p1);
```

Runtime semantics, shaped after Ripple's boundary refcounter rather than a
single composite promise:

- Generalize `TrySlot.pendingThenable` (single) to a **pending set with
  supersession**: each suspension episode owns a request-generation token;
  members are the still-pending thenables the boundary is waiting on; stale
  resolutions from a superseded generation are ignored (Ripple's
  `active_requests` shape). `attachResume`'s dedup and
  `HELD_TRANSITIONS`/`STAGED_REVEALS` entanglement keep working — the boundary
  becomes "ready" when its pending set drains (all fulfilled) or any member
  rejects, which is when the single retry fires.
- `_$useBatch(thenables)` pre-tags each entry's `status` (skipping non-thenables
  and Contexts via the `$$kind` check), and if any are pending, throws one
  `SuspenseException` that enrolls the whole pending set. All settled → no-op;
  the following `use()` calls unwrap synchronously from cache.
- **Rejection ordering matches sequential observation:** the replay unwraps in
  textual order, so the first-in-order rejection throws to `@catch`. The
  wake-on-first-rejection rule means a later-rejects-while-earlier-pending race
  costs one extra (correct) suspend cycle on the error path — acceptable.
- A replay that discovers a *new* pending `use()` (an unhoistable dependent
  creation) **joins the current pending set** instead of replacing a single
  `pendingThenable` — dependent chains no longer thrash the retry wiring.
- This phase alone fixes replay churn for the pre-existing-promises case
  (`use(ThingPromise); use(OtherThingPromise)`): one retry, one replay.

### Phase 4 — Diagnostics, SSR, docs, tests

- **Dev waterfall warning** (à la Svelte's `await_waterfall`): when a replay
  reaches a `use()` at a new index whose creation could not be hoisted, log the
  binding-level dependency chain (`c depends on a via a.ref`) so intentional
  chains are visible and accidental ones get fixed. Dev-only, once per site.
- **SSR mirror:** apply the same memoize+hoist+batch emit in `compileServer` so
  `render()` starts independent fetches in parallel; verify the server unwrap
  loop and the SSR suspense-cache keying (server-mode `use` slots) are
  compatible with hoisted creations.
- **Docs:** new intentional-divergence entry in
  `docs/react-parity-migration-plan.md` and `docs/differences-from-react.md`
  (fetch-start timing + single-replay batching); README note under the `.tsrx`
  authoring section ("you do not need to pre-create promises; the compiler
  parallelizes independent `use()` calls").
- **Changeset:** patch (0.x alpha track), covering compiler + runtime.
- Optional nice-to-have (separate decision): expose an `AbortSignal` to
  memoized creations so superseded in-flight fetches can be cancelled on dep
  change (Ripple's `abort(TRACKED_UPDATED)` analogue). API-surface decision —
  not core to this plan.

### Phase 5 (research, optional) — Speculative discovery

For patterns the static analysis cannot prove (a `use()` behind a condition
that reads an earlier result), a compiler-*gated* speculative pass could warm
fetches — only where the compiler proves the intervening code pure. Prior art
says the edges are sharp (React prewarming double-fetches; Crom,
https://www.usenix.org/legacy/event/nsdi10/tech/full_papers/mickens-crom.pdf).
Park until Phases 1–3 ship and real-world gaps justify it.

## Edge cases and rules

| Case | Rule |
|---|---|
| `use(context)` | Untouched: trivial args skip Phase 1; `_$useBatch` skips `$$kind === CONTEXT_TAG` entries at runtime. |
| `use()` behind `@if` / plain `if` / early-return guard | Batched only within its own block; slot symbols are already conditional-safe. Never lift a creation out of its guarding condition. |
| `use()` in loops | Excluded from Phases 1–2 pending Decision point 2 (per-call-site symbols collide across iterations for base hooks — verify how `useMemo` behaves in a loop before including). |
| Dependent creations (`use(f(a))`) | Not hoisted; on replay they join the pending set (Phase 3); dev warning explains the chain (Phase 4). |
| Interleaved non-declaration statements | Terminate the batch run (v1 conservatism). |
| Hydration | Seed adoption is keyed to `use()` call order, which the transform preserves. Add an explicit hydration test with a batched pair. |
| Transitions | The pending set replaces the single `pendingThenable` inside the existing `handleSuspense`/`STAGED_REVEALS` flow; entangled-boundary commit barriers unchanged. Add a transition test with a batched pair inside one boundary plus a sibling boundary. |
| Rejection while batch partially pending | Wake on first rejection; replay unwraps in textual order; earlier-pending members re-enroll. |
| Differential suite (`tests/differential/`) | Compares final `innerHTML` only — unaffected by fetch-start timing. Do NOT add a differential fixture that asserts fetch counts against React; that comparison now intentionally diverges. |
| Conformance suite | Any port pinning React's waterfall timing gets the `it.fails` + `// GAP`-style annotation inverted — Octane is deliberately better here; annotate as intentional divergence, not GAP. |
| `WaterfallBody` pin (`tests/suspense.test.ts`) | Flips by design: with the transform on, `bStarts === 1` at mount. Rewrite as the positive assertion of parallel starts; keep an opted-out variant pinning the sequential behavior so the flag's off-state stays tested. |

## Test plan

New/updated fixtures in `packages/octane/tests/_fixtures/suspense.tsrx` + suites
in `tests/suspense.test.ts` (and a server twin):

1. Independent pair → both fetches start in the first attempt; **one** replay;
   fallback shows once (mount) / prior DOM held once (transition update).
2. Dependent chain (a → c) → two suspension rounds exactly; dev warning fired
   once with the right chain.
3. Mixed batch (2 independent + 1 dependent) → strata of sizes 2 then 1.
4. Update with changed deps → old generation superseded (stale resolution
   ignored), new fetches batched, single replay.
5. Update with unchanged deps → no refetch (memo hit), no suspension.
6. Rejection: first-in-order rejects → `@catch` with that reason; later-in-order
   rejects while earlier pending → still correct arm, extra cycle tolerated.
7. Conditional `use()` batch inside a guard that opens on a later render.
8. Un-memoized fresh promise on replay (transform off / hand-written) → stored
   thenable reused + dev warning (Phase 1 safety net).
9. Hydration: SSR-seeded batched pair adopts in order, no client refetch.
10. Transition entanglement: batched boundary + sibling boundary commit
    atomically.
11. Compiler-output assertions for the emit shape (memo wrap, hoist order,
    `_$useBatch` placement), in the existing compiler-test style.

Gates per phase: full `pnpm test`, `pnpm typecheck`, `pnpm format:check`;
`tests/differential/` + `tests/conformance/` after Phases 2 and 3.

## Decision points (maintainer input wanted before executing)

1. **Flag vs default-on.** Recommendation: ship behind a compiler option
   (`parallelUse`, autoCallback-style) through the test cycle, then flip the
   default while still 0.x. The off-state keeps the sequential pin test.
2. **Loop slots.** Verify how symbol-keyed base-hook slots behave across loop
   iterations (CLAUDE.md says hooks may sit in loops; per-call-site symbols
   suggest iteration collision for `useMemo`). Until verified, Phases 1–2
   exclude loops.
3. **Dep-array granularity** for auto-memoized creations: free-variable deps
   (autoCallback-style, e.g. `[props]`) vs member-path deps (`[props.id]`).
   Member-path avoids over-refetching on unrelated prop changes;
   recommendation: member-path where the analysis is certain, falling back to
   the base identifier.
4. **AbortSignal for superseded fetches** (Phase 4 nice-to-have): worth an API
   surface now, or wait for demand?
5. **`_$useBatch` visibility tier**: semi-public compiler-emit (index.ts tier 2)
   per the established convention — confirm.
