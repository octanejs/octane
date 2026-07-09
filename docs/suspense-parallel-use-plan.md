# Parallel `use()`: killing suspense waterfalls with the compiler

> Produced 2026-07-08 from a three-track research pass (runtime deep-dive of
> `useThenable`/`handleSuspense`/`attachResume`, compiler deep-dive of the hook-slot
> and free-identifier machinery, and a primary-source prior-art survey of React
> `main`, Solid 2.0, Ripple, Svelte async, Vue, Qwik, Marko, Relay, and userland
> patterns). Status: **PLANNED, not built.** Line references are against the
> 2026-07-08 working tree and will drift; function names are the stable anchors.
>
> **Measurement harness exists (2026-07-08):** `benchmarks/async-waterfall` —
> 10 nested `use()` levels, init + transition update, vs React 19 / Solid 2.0 /
> ripple. Recorded: octane 10.9× the 16ms latency floor (React 19.1× on init),
> solid/ripple ≈1.1× (parallel by model). That ~10× is the number this plan
> exists to close; when it lands, add octane-vs-solid/ripple ratio guards so
> the win can't regress (only octane-vs-react is guarded today).

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

3. **Nested-component waterfalls (the typical real-world shape — and what
   `benchmarks/async-waterfall` actually measures).** Routes render layouts
   render cards, each with its own `use()`. A parent's suspension aborts its
   render *before the child slot is created*, so the child — whose props are
   often provably independent of the parent's data (`<Level level={level + 1}
   version={version}/>` in the bench fixture) — never mounts and never starts
   fetching. Costs 1–2 are intra-body; this one crosses component boundaries,
   and no intra-body transform touches it: Phases 1–3 alone leave the bench at
   ~10.9× the latency floor. Phase 4 exists to close it.

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
| Runtime-only speculative execution past the throw (poisoned sentinel, arbitrary user code re-run blindly) | Rejected. Crom-style speculation; unsound without purity proofs; React's far weaker prewarming already caused ecosystem double-fetch pain. The *proof-carrying* variant — compiler-sliced warm functions that never run arbitrary user code — IS viable and is Phase 4. Blind speculation for unprovable cases stays parked (Phase 6). |
| Full speculative render of suspended subtrees (render children into detached blocks, adopt on resume) | Rejected. Needs adoption/teardown machinery, effect suppression, and re-imports React-prewarm double-execution hazards. Warming only needs fetches *started*, not DOM built — the sliced warm plan gets the same network behavior with none of the commit risk. |
| Ripple-style continuation compilation of `@try` bodies | Rejected for this problem. Continuations fix *replay cost*, not waterfalls — Ripple's own body-`await` is sequential by design and routes parallelism through eager creation. Would be a major departure (hook/effect timing, sync-render guarantees, hydration) for no waterfall benefit. |
| `useAll([...])` / `use(Promise.all(...))` sugar | Rejected as the mechanism (all-or-nothing readiness, coupled rejection, per-value reveal lost). The runtime wakeup below borrows the shape while keeping per-value unwrapping. |
| Compiler preload transform + batched boundary wakeup + compiler-sliced cross-component warming | **Chosen.** Phases below. |

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
  expressions. Document as an intentional divergence (see Phase 5): *Octane
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

### Phase 4 — Cross-component fetch-tree warming (closes the benchmark)

The headline phase: extract, at compile time, each component's **fetch tree**
and walk it ahead of rendering, so a nested chain's fetches all start in the
first render tick. Conceptually this is Relay's "parallel data tree" — but
*derived automatically from component code* instead of authored as colocated
GraphQL fragments.

**Emit.** Alongside each compiled component, the compiler emits a warm
function containing only the compiler-sliced *fetch plan*:

```js
// function Level({ level, version }) @{
//   const data = use(fetchData(level, version));
//   ... @if (level < LEVELS - 1) { <Level level={level+1} version={version}/> } ...
Level.__warm = (props, w) => {
	_$warmMemo(w, () => fetchData(props.level, props.version),
		[fetchData, props.level, props.version], _h$0);
	if (props.level < LEVELS - 1) {
		_$warmChild(w, Level, { level: props.level + 1, version: props.version }, _h$c0);
	}
};
```

The parent's compiled body invokes warm calls for provably-reachable child
component slots **before its first unwrap** (alongside the Phase 2 hoists), and
`_$warmChild` recurses — the entire descendant fetch tree is walked
synchronously in the initial attempt. Warming is therefore not triggered *by*
suspension; it happens whether or not the parent suspends, and on transition
updates it re-runs with the new props, so `update` parallelizes identically.

**Slicing rules (what may appear in a warm function).** The slice for a
component includes only the statements transitively needed to compute
(a) memoized `use()` creations, (b) child-slot reachability conditions, and
(c) child prop expressions — and only when every ingredient is *warm-safe*:

- expression evaluation, `const`/`let` declarations, ternaries/logical ops;
- **ghost hooks**: `useMemo` creations execute into the warm cache; `useState`
  resolves to its *initializer value only* (no state registered — the real
  mount owns state); `use(Context)`/`useContext` reads resolve against the
  live parent scope (warming runs under the real parent block, so providers
  are visible);
- a child slot enters the plan only when its reachability condition AND all
  its prop expressions are independent of every not-yet-unwrapped `use()`
  result on the path (same `collectFreeIdentifiers` legality as Phase 2).

Anything outside this set (assignments to outer scope, arbitrary calls other
than the fetch creations themselves, refs, effect-dependent values,
unprovable conditions) **cuts the slice at that edge at compile time**. The
plan is best-effort and always sound: warm less = slower but never wrong.
No DOM is created, no effects run, no state registers, nothing commits —
mis-speculation can only ever waste a fetch, never corrupt behavior.

**Warm cache.** A per-root map keyed by (call-site slot symbol path, dep
values). `_$warmMemo` dedups on that key, so re-warming (a second render
attempt before resume) never double-starts a fetch. When the real child
mounts, its `useMemo` initializer consults the warm cache first and *adopts*
the entry into the real hook slot (transfer, not copy). Dep mismatch (props
drifted between warm time and mount) is a plain miss: the real mount fetches
fresh — a wasted prefetch, correct behavior; the orphan is evicted on
boundary commit (and aborted, if the Phase 5 AbortSignal lands).

**Recursion and lists.** Reachability conditions in the plan are evaluable at
warm time (they were proven independent), so recursive components terminate
exactly where the real render would (`level < LEVELS - 1`). A runtime depth
cap (Decision point 6) plus a dev warning backstops chains the compiler
cannot prove finite. `@for` child slots enter the plan only when the list
source itself is warm-available (not gated behind a pending `use()` in the
same body — often it IS the suspended data, in which case that edge cuts,
correctly: those children are data-dependent, a true waterfall).

**SSR.** The same warm walk in `runtime.server.ts` collapses server-side
nested-fetch depth to true dependency depth — directly measurable today via
`ssr-throughput`'s `waterfall-d1/d2/d4` ops, in addition to the client suite.

**Result on `benchmarks/async-waterfall`:** all 10 levels' fetches start in
the first tick; init and update land near the parallel floor (~1.1–1.3×,
solid/ripple territory) instead of 10.9×. Ship-time: tighten `ratios.json` —
keep octane-vs-react ≤1.2, add octane-vs-solid and octane-vs-ripple ceilings
(~1.5× to absorb replay overhead) so the win cannot regress.

**Cost to watch:** warm functions are extra compiled output. The
`codegen-size` and `bundle-size` suites guard this — emit warm functions only
for components that (transitively) contain `use()` creations or async
descendants, and skip emit entirely for leaf/sync components so the tax is
proportional to actual async surface.

### Phase 5 — Diagnostics, SSR, docs, tests

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
- **Website:** update the homepage "Compiled templates" feature block
  (`website/src/pages/Home.tsrx`) to call out waterfall removal, once the
  transform is on by default (do not advertise before it ships). Draft copy,
  replacing the current body:

  > Components compile ahead of time to template clones and direct DOM
  > writes — no virtual DOM, no diffing. The compiler even removes suspense
  > waterfalls, proving which `use()` fetches are independent and starting
  > them together.
- **Changeset:** patch (0.x alpha track), covering compiler + runtime.
- Optional nice-to-have (separate decision): expose an `AbortSignal` to
  memoized creations so superseded in-flight fetches can be cancelled on dep
  change (Ripple's `abort(TRACKED_UPDATED)` analogue). API-surface decision —
  not core to this plan.

### Phase 6 (research, optional) — Blind speculative discovery

For the residue Phase 4's proofs cannot reach (a `use()` or child slot gated
on a condition that genuinely reads an earlier result, fetch args flowing
through un-sliceable code), a *blind* speculative pass could re-run user code
with placeholder values to discover fetches. Prior art says the edges are
sharp (React prewarming double-fetches; Crom,
https://www.usenix.org/legacy/event/nsdi10/tech/full_papers/mickens-crom.pdf).
Park until Phases 1–4 ship and real-world gaps justify it — the expectation
is that Phase 4's coverage makes this unnecessary.

## Edge cases and rules

| Case | Rule |
|---|---|
| `use(context)` | Untouched: trivial args skip Phase 1; `_$useBatch` skips `$$kind === CONTEXT_TAG` entries at runtime. |
| `use()` behind `@if` / plain `if` / early-return guard | Batched only within its own block; slot symbols are already conditional-safe. Never lift a creation out of its guarding condition. |
| `use()` in loops | Excluded from Phases 1–2 pending Decision point 2 (per-call-site symbols collide across iterations for base hooks — verify how `useMemo` behaves in a loop before including). |
| Dependent creations (`use(f(a))`) | Not hoisted; on replay they join the pending set (Phase 3); dev warning explains the chain (Phase 5). |
| Interleaved non-declaration statements | Terminate the batch run (v1 conservatism). |
| Child props depend on suspended data (`<Detail item={data.first}/>`) | Correctly excluded from the warm plan — a true data dependency; that child's fetches start on resume (dependency-depth behavior). |
| Recursive warm chains | Reachability conditions evaluated at warm time bound the walk; runtime depth cap + dev warning backstops unprovable recursion (Decision point 6). |
| Warm/mount prop drift (state changed between warm and commit) | Dep-keyed warm cache misses → real mount fetches fresh; orphan evicted on boundary commit. A stale warm entry can never be adopted. |
| Re-warm before resume (second update while pending) | `_$warmMemo` dedups on (slot path, deps) — no double-started fetches; superseded generation's orphans evicted. |
| Component identity at warm time (`<Dynamic is={X}/>`, component from suspended data) | Warm requires a statically-resolvable component binding with a `__warm` emit; dynamic/component-valued props cut the edge. |
| Warm emit size | Emit `__warm` only for components with `use()` creations or async descendants; guarded by `codegen-size`/`bundle-size` suites. |
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
    `_$useBatch` placement, `__warm` slicing), in the existing compiler-test
    style.
12. Nested chain (3-level `Level`-style fixture): all levels' fetch counters
    hit 1 in the first attempt; init resolves in ~1 latency unit, not 3; same
    via a transition update.
13. Warm-cache adoption: real mount's `useMemo` adopts the warmed promise
    (same instance, fetch counter stays 1); prop drift between warm and mount
    → miss, fresh fetch, orphan evicted.
14. Warm exclusion: child whose props read suspended data does NOT prefetch;
    ghost `useState` sees initializer only; dynamic component slot cuts the
    warm edge.
15. Bench: `async-waterfall` init/update land near the parallel floor;
    tighten `ratios.json` (keep react ≤1.2, add solid/ripple ceilings) and
    re-record; `ssr-throughput` `waterfall-d*` ops improve with the SSR warm
    walk.

Gates per phase: full `pnpm test`, `pnpm typecheck`, `pnpm format:check`;
`tests/differential/` + `tests/conformance/` after Phases 2–4;
`node benchmarks/bench.mjs async-waterfall --compare` after Phase 4.

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
4. **AbortSignal for superseded fetches** (Phase 5 nice-to-have): worth an API
   surface now, or wait for demand?
5. **`_$useBatch`/`_$warmMemo`/`_$warmChild` visibility tier**: semi-public
   compiler-emit (index.ts tier 2) per the established convention — confirm.
6. **Warm depth cap** for recursion the compiler can't prove finite:
   recommend 64 with a dev warning naming the component chain.
7. **Ghost-hook scope in warm slices**: v1 = `useMemo` creations + `useState`
   initializer values + context reads. Anything more (e.g. evaluating custom
   hooks' pure prefixes) expands coverage but multiplies proof surface —
   recommend deferring until real components show the need.
