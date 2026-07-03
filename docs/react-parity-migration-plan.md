# React → Octane Test-Parity Migration Plan

> Goal: systematically port the *in-scope* unit-test behaviors from `facebook/react`
> into Octane's `.tsrx` test suite, and close the runtime gaps those tests expose —
> so "you can swap React for Octane" is proven, not asserted.

This plan was produced by cross-referencing the **entire React test inventory**
(76 react-reconciler + 129 react-dom + 25 react-core test files, ~230 files) against
Octane's current 97 test files, and verifying the highest-stakes findings against
`packages/octane/src/runtime.ts`.

---

## 1. Method & infrastructure we already have

Octane already has the right machinery; this plan scales it, it does not invent it.

- **Differential rig** (`tests/differential/_rig.ts`): compiles the *same* `.tsrx`
  fixture through both Octane and `@tsrx/react`, mounts both, drives identical event
  steps, and asserts normalized `innerHTML` equality after each step. This is the
  gold-standard "behaves identically" proof.
- **Conformance tests** (`tests/conformance/`, `tests/react-conformance.test.ts`):
  hand-ported React behaviors that **cite the source `it(...)` title + line**
  (e.g. `ReactHooksWithNoopRenderer-test.js:1885`) so drift is trackable. This is the
  migration pattern we extend.
- **Helpers** (`tests/_helpers`): `mount` / `act` / `update` shims that mirror React's
  test ergonomics.

### Two infrastructure additions this plan requires

1. **Move-instrumented differential harness** (new). The current rig compares only
   *final* `innerHTML`, so it is **blind to which DOM nodes were physically moved /
   detached / re-inserted** during a reorder. That is exactly where Octane's LIS
   reconciler can diverge from React (see §3 Tier 0). We need a variant of
   `mountDifferential` that wraps `Node.insertBefore` / `removeChild` / `appendChild`
   on both containers, records the operation sequence, and asserts the *move set*
   matches — not just the end state.
2. **A NoopRenderer-equivalent log harness.** Many React reconciler tests assert an
   ordered `Scheduler.log([...])` of yields/effects rather than DOM. Octane's
   `act()` + an effect-log fixture pattern (already used in
   `react-conformance.test.ts`) covers this; standardize it as a helper so the
   reconciler/scheduling ports are mechanical.

---

## 2. Scope filter (what we deliberately do NOT port)

Octane is function-components + hooks + concurrent-root + DOM + SSR/hydration. The
following React test areas are **out of scope by design** — document the divergence,
don't port:

| React area | Why out of scope |
|---|---|
| Class components, `createClass`, `this.refs`, string refs | Octane has no class components. *Port the underlying reconciler/effect OUTCOME via function components + hooks where the behavior is renderer-level.* |
| `componentDidCatch` / `getDerivedStateFromError` mechanics | Octane uses `@try`/`@catch`. Port the catch OUTCOME, not the lifecycle. |
| Legacy / sync mode, legacy roots | Octane is concurrent-root only. |
| Rules-of-hooks enforcement, hook-order warnings | **Intentional divergence** — Octane tracks hooks by call site; conditional hooks are legal. |
| StrictMode double-invoke of effects/render | Octane has no StrictMode (verified: no `StrictMode`/double-invoke in runtime). |
| Synthetic event system internals (`isPropagationStopped`, event pooling, synthetic `onChange`/`onBeforeInput`/`onComposition*`/`onSelect` polyfills) | Octane uses **real delegated DOM events**. Match user-visible OUTCOMES; the synthetic API surface diverges. |
| **Controlled components + synthetic `onChange`** (value/checked re-asserted from a controlled prop, edits reverted, `defaultValue` mapping, `<select value>`/`<textarea value>` controlled semantics) | **Intentional divergence (decided 2026-06-24).** Octane is native-event / uncontrolled by design: `value`/`checked` are plain attributes, events are native (`onInput`), and the DOM is the source of truth. React's controlled-input contract is explicitly NOT a target. **Do NOT port `ReactDOMInput`/`Select`/`Textarea` controlled-value tests.** The *uncontrolled* DOM-attribute and event-delegation behaviors (attribute removal vs empty-string, boolean reflection, **event bubbling incl. through portals**) ARE in scope. |
| DEV-only warnings (unknown props, casing, controlled↔uncontrolled switch, nesting validation) | Octane's warning policy differs; port the functional outcome only. |
| `class` / `className` value coercion | **Intentional divergence.** Octane composes `class`/`className` clsx-style (strings, numbers, arrays, objects, nesting; falsy drops out) at every apply site — client, spread, SVG, scoped-`<style>`, and SSR (byte-identical, so hydration matches). React coerces `className={['a','b']}` to `"a,b"`; Octane yields `"a b"`. A plain string still takes the fast path. |
| **`useSyncExternalStore` commit-time getSnapshot re-read** (the `useSyncExternalStore-test.js` `:144` tearing check) | **Intentional divergence (decided 2026-07-03).** React's `updateSyncExternalStore` re-pushes `updateStoreInstance` whenever `inst.getSnapshot !== getSnapshot`, giving a commit-time snapshot re-read even for an unchanged value. Octane drops that: getSnapshot is refreshed in RENDER, and the commit-time store-sync (drainStoreSyncs) only runs when the read snapshot actually moved off the last-committed value (or the store was swapped) — so an unchanged snapshot with an unstable inline getSnapshot (the zustand/query pattern) enqueues nothing. Consequence: a store that mutates WITHOUT notifying in the render→commit window is no longer caught on a render where ONLY getSnapshot identity changed. Octane's synchronous renderer closes React's motivating concurrent-interleaving window, and any store that actually notifies is unaffected (onStoreChange compares against the render-fresh getSnapshot). Do NOT "fix" this back toward React's per-render commit re-read. See `useSyncExternalStore` in `runtime.ts`. |
| Owner-based identity (`should NOT replace children with different owners`) | Modern React already dropped owner identity — confirm Octane matches (mount=1, unmount=0) but it's a 1-test check, not an area. |
| Server Components / RSC / Flight | Not supported. |
| Fizz **streaming** APIs (renderToPipeableStream, progressive chunks, shell hydration, selective/priority hydration of streamed boundaries) | Octane SSR is non-streaming. *Salvage the OUTCOME-level hydration tests (mismatch recovery, useId match, input value preservation), skip the streaming machinery.* |
| `SuspenseList` (`revealOrder`/`tail`) | Not in Octane's component set (verify, then skip the whole `ReactSuspenseList-test.js`, the SuspenseList parts of `ReactDOMUseId`/`ReactContextPropagation`). |
| CPU Suspense (`unstable_expectedLoadTime`), Suspensey commit phase (suspend-on-resource-load during commit), `unstable_avoidThisFallback`, `unstable_suspenseCallback` | Unstable/unsupported APIs. |
| Profiler (`actualDuration`/`treeBaseDuration`), DevTools component-stack/displayName | Not supported. |
| ViewTransitions, Float/resource hoisting (`ReactDOMFloat`) | Out (Octane has limited head-singleton support only). |
| `React.Children.*` utilities (`ReactChildren-test.js`) | Octane uses `@for`. Only the missing-key-warning *policy* is conceptually portable. |

**Verify-existence flags** before porting their files: `useEffectEvent` (exists —
`callbacks.test.ts`), `useMemoCache`/React-Compiler `c()` cache (likely absent →
skip `useMemoCache-test.js`), `suppressHydrationWarning` prop (verify), default
transition indicator API (`onDefaultTransitionIndicator` — verify).

---

## 3. Gap analysis — prioritized by tiers

Each tier lists: the **React source files**, the **specific behavior gap** in Octane,
and **severity**. Line numbers are anchors into the cloned React tests for the porter.

### Tier 0 — Reconciler heuristic parity ⟵ the core of "match React's reconciler heuristics"

This is the heart of the request. Octane's keyed reconciler is **LIS-based**
(`lis()` at `runtime.ts:6000`, `reconcileKeyed` at `runtime.ts:5347`), ported from
Ripple/Solid/Vue. React's `reconcileChildrenArray` uses a greedy **`lastPlacedIndex`**
pass and **does not minimize moves**.

- **They produce the same final DOM but different *move sets*.** Example: old
  `[A,B,C,D]`, reorder to `[D,A,B,C]`. React moves A,B,C (3 inserts after D); Octane's
  LIS moves only D (1 insert before A). Identical `innerHTML`; **different nodes
  detached** → observably different focus retention, scroll position, CSS transitions,
  `<video>`/`<iframe>` reload, IntersectionObserver callbacks.
- **The current differential rig cannot see this** (innerHTML-only). This is a
  genuine, untested divergence — and the central thing to resolve.

> **DECISION REQUIRED (§6, Q1):** adopt React's `lastPlacedIndex` move algorithm to
> match observable move behavior, **or** keep LIS (better minimization) and document
> the divergence. Everything in this tier's *test* work assumes a move-instrumented
> harness regardless; the *runtime* work only happens if we choose to match React.

Files / behaviors to port (via the new move-instrumented harness + identity-log fixtures):

| React file | Behavior to pin | Severity |
|---|---|---|
| `ReactMultiChildReconcile-test.js` (29 tests) | The definitive identity battery: reverse/cycle = **pure moves, zero remounts** (`:612,:630,:650,:697`); removed-then-readded = **remount, new identity** (`:311,:365,:422`); `null` ≡ `false` ≡ absent (`:532-563,:744`); insert position (front/middle/back) is **identity-neutral** for survivors (`:784-961`); behavior identical across array vs iterable children. | **Critical** |
| `ReactMultiChild-test.js` (`:28,:74,:158,:462,:505`) | Remount triad: same type+key → update in place; type change → remount; key change → remount. **Bailed-out (memoized) children still physically move** (`:462`). **New children mount before old unmount** (`:505`). | **Critical** |
| `ReactChildReconciler-test.js` (`:85,:143`) | Duplicate-key policy (first-seen wins; warn). Defines the one-to-one key set the LIS pass relies on. | High |
| `ReactFragment-test.js` (24 tests) | Child-reconciliation **state-preservation identity rules**: exactly when wrapping/unwrapping in Fragment/array preserves vs remounts state (`:84-1014`), keyed-vs-unkeyed fragment distinction (`:553,:600`), reorder-in-multiple-levels (`:641`). | **Critical** |
| `ReactTopLevelFragment-test.js` (5) | Single-child ↔ fragment slot equivalence; implicit-key null-slot rule (`:101`); reorder preservation. | High |
| `ReactIncrementalSideEffects-test.js` (`:185,:247`) | Type-change with implicit vs explicit keys (remount vs preserve). | High |
| `ReactIncrementalUpdatesMinimalism-test.js` (3, **all heuristic**) | "Don't diff referentially-equal host elements" (`:48`); "don't diff parents of setState targets" (`:86`) — updates start at the dirty block, ancestors bail. Counts exact host-effects. | High |
| `ReactMultiChildText-test.js`, `ReactDOMTextComponent-test.js` | Text-node reconciliation matrix incl. bigint, null/undefined→nothing, split/normalized text nodes, separators. | Medium |
| `ReactTopLevelText-test.js` (3) | Component may return bare string/number/bigint. | Low |

### Tier 1 — Hook heuristics not yet pinned

Octane's hook coverage is already strong (`react-conformance.test.ts`,
`conformance/react-hooks-scenarios.test.ts`, `effect-timing.test.ts`). Remaining gaps
are the *subtle scheduling heuristics*:

| React file | Gap | Severity |
|---|---|---|
| `ReactHooks-test.internal.js` (`:67,:156,:372,:450,:508,:289`) | **Eager state bailout**: render-then-bail-before-commit; skip render phase when update queue is known empty; bail multiple times in a row; rebase a previously-skipped update; context change **defeats** bailout. | High |
| `ReactDOMHooks-test.js` (`:124,:157`) | Update scheduled inside an event handler does **not** get eagerly bailed out. | High |
| `ReactHooksWithNoopRenderer-test.js` (`:3889-4067,:4120,:4153,:4327`) | **useReducer does NOT eagerly bail** (unlike useState); does not replay no-op actions, but applies them when made relevant by other batched updates. | High |
| `ReactEffectOrdering-test.js` (`:37,:64`) | Effect-cleanup on deletion fires **parent → child** (opposite of mount's child→parent). Octane tests child-first mount order but not parent-first deletion order. | High |
| `ReactHooksWithNoopRenderer-test.js` (`:2564-2738`) | `useInsertionEffect` ordering: after snapshots, before layout, interleaved-then-layout. Octane has the hook but limited ordering tests. | Medium |
| `ReactUse-test.js` (`:899,:957,:1034,:1088`) | **Hook-replay-after-suspend**: on replay render, previously-computed useMemo/useState are reused not recomputed. Plus sync-fulfilled thenable does not suspend (`:789`), microtask-ping retries without unwinding (`:118`). | High |
| `useSyncExternalStore-test.js` (`:144,:355`) | **Tearing prevention**: interleaved store mutation during concurrent read caught before layout effects; no infinite loop on unstable store ref. | High |
| `ReactDeferredValue-test.js` (24, nearly all heuristic) | **useDeferredValue spawn-second-render**: reuse-previous-not-initial under urgent (`:298`); only first level defers (`:739`); preview-state skip when final value is `Object.is`-identical (`:981` vs `:1020`); waterfall avoidance across Suspense boundary (`:828`). | High |
| `React-hooks-arity.js` (`:23,:34`) | Setter/dispatch `.length === 1`. Trivial conformance. | Low |
| `useRef-test.internal.js` (`:107`) | Same ref object across re-renders (Octane tests this; confirm parity). | Low |

### Tier 2 — Context propagation through bailouts

Octane covers basic context + memo-through-context (`hook-fixes.test.ts`). The deep
propagation heuristics are unpinned:

> **Update (2026-07-03):** `memo()`'s bail + lazy per-context consumer refresh now also
> work at VALUE positions (provider children, `createElement` binding trees) and through
> array-children boundaries — see `memo-value-position.test.ts` and the childSlot
> `tryMemoBail` unification. React's **implicit same-element bailout** (identical child
> element reference → skip the subtree, refresh only changed-context consumers) remains
> UNIMPLEMENTED: octane re-renders the provider's subtree, and bindings that rely on the
> implicit bail express it explicitly with a `memo()` pass-through (see
> `@octanejs/radix`'s NavigationMenu `MemoChildren` + its two documented residual
> adaptations). Implementing the implicit bail = extending `tryMemoBail`'s comparison to
> identical incoming descriptors on non-memo components; the context-refresh machinery it
> would ride already exists.

| React file | Gap | Severity |
|---|---|---|
| `ReactNewContext-test.js` (32) | Consumer bails on `Object.is`-equal value (`:218,:458`); consumer **inside a bailed subtree still re-renders** if context changed but **doesn't bail if nothing above bailed** (`:624,:1130,:1267`); doesn't bail inside hidden subtree (`:706`); doesn't skip siblings (`:776`); provider bails if children+value unchanged (`:956`). | High |
| `ReactContextPropagation-test.js` (17) | Context change punches through memo (`:217`), across **Suspense retries** (`:349,:416,:943`), through **offscreen/Activity trees** (`:563,:609,:840`), nested bailouts (`:711,:766`), multiple sibling branches (`:894`). | High |
| `ReactIncremental-test.js` (`:2426,:2484,:2627`) | Context updates reach descendants through bailed subtrees / mid-tree setState. | Medium |

### Tier 3 — DOM attribute & event-delegation heuristics

> **Scope correction (2026-06-24):** controlled inputs / synthetic `onChange` are an
> **intentional divergence** (see §2), NOT a gap. The `ReactDOMInput`/`Select`/
> `Textarea` *controlled-value* tests are deliberately not ported. What remains in
> scope is the **uncontrolled** DOM-attribute matrix and **event delegation**,
> including the portal-bubbling behavior Octane explicitly wants.

| React file | Gap | Severity |
|---|---|---|
| `ReactDOMComponent-test.js` (152) / `ReactDOMAttribute-test.js` / `DOMPropertyOperations-test.js` | Attribute **removal vs empty-string** (src/href/action `:594-690`); boolean reflection/strip; property-vs-attribute matrix + namespaced xlink; no-op mutation minimization. (Octane has SVG/MathML/style coverage already; this fills the HTML-attribute matrix.) | Medium |
| `CSSPropertyOperations-test.js` | px auto-append, vendor-prefix casing, CSS-var passthrough, empty-style→omit. (Octane `style.test.ts` is strong; cross-check the edges.) | Low |
| `ReactDOMEventListener-test.js` (24) | **Real-delegation divergence checks**: non-bubbling event emulation (toggle/cancel/close/invalid/media `:706-794`) vs scroll/selectionchange **not** emulated (`:875,:1275`); media/dialog/load delegated without a direct listener (`:446-669`); no duplicate dispatch (`:295`). | High |
| `ReactDOMEventPropagation-test.js` (89) | Bubble inner→outer for every event; **bubbling through portals** (✅ confirmed working incl. nested portals — see §8); mouseenter/leave + pointerenter/leave **synthesis** (non-bubbling, per-element `:1444,:1517`). NB: capture-phase JSX handlers (`onClickCapture`) ARE now implemented — real capture-phase delegated listeners fire root→target (see `tests/capture-events.test.ts`, compiler `delegateCaptureEvents` + runtime `dispatchDelegatedCapture`). | High |
| `ReactBrowserEventEmitter-test.js`, `ReactTreeTraversal-test.js`, `InvalidEventListeners-test.js` | stopPropagation + mid-dispatch handler snapshot (`:332,:346`); enter/leave common-ancestor path; non-function/null listener safety. | Medium |

> Octane already has strong fragment-ref, SVG, MathML, portal-event, and
> scoped-style coverage — those areas need only edge-case top-ups, not new suites.

### Tier 4 — SSR / hydration determinism

Octane SSR + hydration adoption work. **Mismatch detection + recovery is now implemented**
(2026-06-30): on a server/client divergence the runtime patches VALUE mismatches (text/attr)
to the client value, rebuilds STRUCTURAL mismatches (swapped `@if`/`@switch` branch, changed
tag, host↔component swap, over-long `@for`), supports shallow `suppressHydrationWarning`, and
emits dev-only warnings with Svelte-5-style source locations (`file:line:col`). Recovery runs
in dev + prod; warnings + LOC are dev-only and strictly gated so prod output is byte-identical.
The remaining Tier-4 gaps are the *determinism* heuristics below — the serialization matrix
and the deeper SSR hook/ref/form ports. useId server≡client agreement, don't-blow-away-input,
and the React diff-matrix ports are now done (see below).

| React file | Gap | Severity |
|---|---|---|
| ~~`ReactDOMUseId-test.js` (17)~~ **DONE (2026-06-30)** — `tests/conformance/useid-determinism.test.ts` asserts client stability (across re-renders, wrapper indirection, multiple ids per component) AND **server ≡ client byte-equality after `hydrateRoot()`**. Fixed in `hydrateRoot()`: the client `_idCounter` resets to 0 at the start of hydration so it lines up with the server's per-render reset. | ~~High~~ |
| ~~`ReactDOMServerIntegrationUserInteraction-test.js` (14)~~ **DONE (2026-07-01)** — `tests/conformance/user-input-hydration.test.ts` (6 cases): input/range/checkbox/textarea/select, controlled + uncontrolled, keep the user's typed value across hydration (octane only ever writes ATTRIBUTES, never the dirty `.value`/`.checked` property) with no spurious mismatch warning. | ~~High~~ |
| ~~`ReactDOMHydrationDiff-test.js` (37) + `ReactDOMServerIntegrationReconnecting-test.js` (50)~~ **DONE (2026-07-01)** — ported as `tests/conformance/hydration-mismatch.test.ts` (24 outcome-level cases). Surfaced + fixed 5 runtime bugs (clone close-marker, ifBlock/switchBlock empty-branch cursor + leftover discard, setStyle + setClassName detection). Divergences documented: octane patches attrs to client (React keeps server), warns+rebuilds in place (React throws+re-renders boundary), and function components carry hydration markers (so component-form ≠ bare-element-form). | ~~Medium~~ |
| `ReactDOMServerIntegrationHooks-test.js` (`:606`), `…Refs-test.js` (`:41`), `ReactDOMFizzForm-test.js` (`:442,:531,:549`) | **Effects and ref callbacks do NOT run on server**; hooks render initial values; useFormStatus not-pending / useActionState+useOptimistic return initial on server. (Octane tests "effects don't run on server" partially in `ssr.test.ts`; extend to refs + form hooks.) | Medium |
| `ReactDOMServerIntegrationElements/Attributes/Input/Select/Textarea/Fragment-test.js` | **Serialization heuristics**: text-node/whitespace separators so hydration can split adjacent text; nullish/zero/false child coercion; boolean/reserved-attribute rules; `value`→attribute (input) vs value→children (textarea) vs selected-option (select); fragment flattening. Each `itRenders` is simultaneously server-output + hydration-adopt + mismatch-recovery. | Medium |
| `ReactDOMForm-test.js` (47) + `ReactDOMFizzForm-test.js` (16) | useActionState dispatch-order + error-cancel (`:1099,:1328`); useFormStatus activation rule (pending only in transition/preventDefault path `:2078,:2146,:2217`); uncontrolled inputs auto-reset after action (`:1521`); function-action replay-after-hydration. (Octane `actions.test.ts` covers the basics; deepen.) | Medium |

### Tier 5 — Suspense / transitions / activity (advanced scheduling)

Octane's Suspense/transition/activity coverage is already broad
(`suspense.test.ts`, `transitions.test.ts`, `activity.test.ts`, the `conformance/`
fuzz suites). Gaps are the precise timing heuristics:

| React file | Gap | Severity |
|---|---|---|
| `ReactSuspense-test.internal.js` (`:267,:311,:370`), `ReactSuspenseWithNoopRenderer-test.js` (`:1714,:1778,:1857,:3382`) | **Fallback reveal throttling (~300ms window)**; after showing a fallback, **don't flip back to primary until the suspending update finishes**; unwind immediately on suspend without rendering siblings (`:379`). | High |
| `ReactSuspenseEffectsSemantics-test.js` (25) + `…DOM-test.js` (8) | Effects **destroyed on suspend / recreated on reveal exactly once**, correct order, even when the fallback itself suspends; **no double-cleanup** when suspended/hidden trees are deleted. | High |
| `ReactTransition-test.js` (13) | Transition **entanglement**, **latest-transition-wins** (no intermediate states `:526`), **normal-pri before transition** ordering (`:1085,:1137,:1202`). | High |
| `ReactAsyncActions-test.js` (26) | **Optimistic state not reverted until async action finishes** (`:127,:1249`); optimistic rebasing on latest passthrough (`:685,:1018`); action batching across `await` (`:1699`); urgent updates unblocked during pending action (`:352`); one action's error doesn't taint siblings (`:520`). | High |
| `Activity-test.js` (28), `ActivitySuspense-test.js` (8), `ActivityErrorHandling-test.js` (1) | Hidden Activity preserves state + defers/skips effects; effects mount/unmount on visibility in **parent-before-child** order (`:1155`); insertion effects survive toggles (`:1474`); suspend-in-hidden shows no fallback + no infinite loop (`:98,:174`); errors in hidden tree contained from visible UI (`:29`). | Medium |
| `ReactSuspenseFallback-test.js` (6) | null/undefined fallback renders nothing; nearest boundary catches. | Low |

### Tier 6 — Scheduling / lanes / batching

| React file | Gap | Severity |
|---|---|---|
| `ReactInterleavedUpdates-test.js` (2) | Updates fired by an event **during** a concurrent render are held in a separate queue, not folded into the in-progress render (tearing prevention). | High |
| `ReactUpdatePriority-test.js` (3) | Update scheduled in a passive effect inherits the causing update's priority (default→default, idle→idle); continuous updates preempt transitions. | Medium |
| `ReactIncrementalUpdates-test.js` (`:46,:74,:319,:555`) | Update-queue replay: priority order, then insertion order; render-phase update inherits current lane; rebasing keeps already-committed updates. | Medium |
| `ReactFlushSync-test.js` (`:163,:247,:294`) | Passive effects flush synchronously **only** when resulting from a sync render; flushSync only flushes its own lane; queue fully exhausts even on throw. (Octane `effect-timing.test.ts` partially covers.) | Medium |
| `ReactExpiration-test.js` (14) | Starvation/expiration: time-slicing disabled when expired/CPU-bound; idle never expires; lane entanglement granularity. | Low |
| `ReactBatching-test.internal.js` (`:77,:137`) | Layout-effect updates flush before yield within the event; flushSync leaves batched lower-pri work pending. | Low |

### Tier 7 — Error handling via `@try`/`@catch`

Octane's `try-catch.test.ts` covers basics. The reconciler-under-error heuristics are
the gap (port OUTCOMES via `@try`/`@catch`):

| React file | Gap | Severity |
|---|---|---|
| `ReactErrorBoundaries-test.internal.js` (`:2169,:2198`) | **Catch errors in `useEffect` and `useLayoutEffect`** (directly hooks, in scope). | High |
| `ReactErrorBoundaries-test.internal.js` (`:1978`) | **No inconsistent state when a throw happens *during* keyed reconciliation** (shuffle ~100 keyed children + one thrower). Directly stresses the LIS reconciler under error. | High |
| `ReactErrorBoundariesHooks-test.internal.js` (`:24`) | **Hook order preserved** in the recovering component after a catch. | High |
| `ReactIncrementalErrorHandling-test.internal.js` (`:1540,:685-803`) | Render-one-more-time before catching (retry heuristic); nearest **handling** boundary selection (a non-handling boundary doesn't stop propagation); aborted render's WIP discarded. | Medium |
| `ErrorBoundaryReconciliation-test.internal.js` (`:73,:76`) | Fallback rendering **same type** reuses, **different type** remounts. | Medium |
| `ReactErrorBoundaries-test.internal.js` (`:1158,:1209,:2782`), `ReactFiberRefs-test.js` (`:64`) | Refs reset on aborted mount; ref-detach throw must not block unmount; ref attaches on commit even with no other update. | Medium |
| `refs-test.js` (`:274,:346,:379,:443`) | **React-19 ref cleanup return**: cleanup runs (called with no arg) instead of `null` re-invoke; stable-identity ref not re-run on update. (Octane `ref-cleanup.test.ts`/`ref-identity.test.ts` cover much of this — confirm parity, fill `:346` stable-identity-skip.) | Medium |

---

## 4. Porting mechanics (how a single test gets migrated)

For each React `it(...)` we port:

1. **Classify the assertion target**: DOM output → differential rig or
   `tests/conformance` DOM assertion; ordered scheduler/effect log → `act()` +
   effect-log fixture; move/identity → **new move-instrumented harness**.
2. **Author the fixture in `.tsrx`** under `tests/_fixtures/` (or
   `tests/differential/_fixtures` for differential), translating React idioms:
   - class component → function component + hooks
   - `Scheduler.unstable_yieldValue` / `Scheduler.log` → push to a shared log array
     inside effects/render, drained via `act()`
   - `componentDidCatch` / error boundary → `@try { } @catch { }`
   - `React.Children.map` → `@for`
   - `getSnapshotBeforeUpdate` etc. → nearest hook/effect equivalent (or drop if the
     test is class-mechanics-only)
3. **Write the test** citing the source: `// Per ReactXxx-test.js:LINE — <title>`
   (matches the existing `react-conformance.test.ts` convention).
4. **Where it's a behavior two runtimes should share**, prefer adding it to the
   differential rig so React itself is the oracle — zero hand-maintained expectations.

### Tooling to build first (small, high-leverage)

- `scripts/scaffold-react-port.ts`: given a React test file, emit a checklist of its
  `it`/`itRenders` titles + line numbers as a `describe` skeleton with `it.todo(...)`,
  pre-tagged in/out of scope using the §2 rules. Turns "port a file" into filling
  blanks.
- The **move-instrumented harness** (§1) — unblocks all of Tier 0.
- A standard **effect-log fixture helper** — unblocks Tiers 1, 5, 6, 7.

---

## 5. Sequenced roadmap

| Phase | Focus | Depends on | Rough size |
|---|---|---|---|
| **P0** | Decide LIS vs `lastPlacedIndex` (§6 Q1). Build move-instrumented harness + effect-log helper + scaffold script. | — | Small, unblocks everything |
| **P1** | **Tier 0** reconciler identity battery (MultiChildReconcile, Fragment, TopLevelFragment, MultiChild, ChildReconciler, Minimalism). If P0 chose to match React, land the `lastPlacedIndex` runtime change here, proven by the move harness. | P0 | Large, highest value |
| **P2** | **Tier 1** hook heuristics + **Tier 7** error-in-effect / hook-order-after-catch / throw-during-reconcile. | P0 helpers | Medium |
| **P3** | **Tier 2** context propagation through bailouts. | P1 (bailout semantics) | Medium |
| **P4** | **Tier 3** controlled inputs + DOM attribute/event delegation matrix. Likely surfaces real runtime fixes. | — (independent) | Large |
| **P5** | **Tier 4** SSR/hydration determinism. ~~mismatch detection + recovery~~ **DONE (2026-06-30)** — detect/patch/rebuild + `suppressHydrationWarning` + dev source-LOC. Remaining: useId server≡client assertions, don't-blow-away-input, no-effects/refs-on-server, serialization matrix. | — | Medium |
| **P6** | **Tier 5** Suspense/transition/activity timing + **Tier 6** lanes/interleaved. | P0 log helper | Medium |

P4 and P5 are independent of P0–P3 and can run in parallel by a second contributor.

---

## 6. Decisions (resolved 2026-06-24)

1. **Reconciler move heuristic — RESOLVED: keep LIS, document the divergence.**
   Octane keeps its minimal-move LIS reconciler (fewer DOM ops = faster) and treats
   the move *pattern* as an intentional, documented divergence from React's
   `lastPlacedIndex`. Consequence for the plan:
   - **P1 is test-only** — no runtime change to the reconciler.
   - The Tier 0 harness asserts **survivor node-identity preservation + final order
     parity** (which LIS and React share), **not** the physical move sequence (which
     they don't). i.e. it proves keyed survivors are never spuriously remounted and
     end up in the right order — it does *not* require Octane to detach the same nodes
     React would.
   - This divergence must be written up in the user-facing docs (a "differences from
     React" note: Octane minimizes DOM moves on reorder, so which nodes are physically
     re-inserted can differ; final DOM is identical).
2. **Hydration mismatch detect + recover — IMPLEMENTED (2026-06-30).** `hydrateRoot` now
   detects server/client divergence during hydration and recovers:
   - **VALUE (text / attribute):** patched to the client value (`htext`/`htextSwap`/
     `childTextHole`/`setAttribute`); `suppressHydrationWarning` (React shallow semantics)
     keeps the server value + suppresses the warning, and is never serialized by SSR.
   - **STRUCTURAL:** `clone()` compares the adopted server node vs the template (nodeType +
     tag + static attributes) and rebuilds the subtree on a mismatch — discard the divergent
     server range, fresh-clone, advance the cursor. Covers swapped `@if`/`@switch` branches
     (including same-tag, via static attrs), changed tags, host↔component swaps. `mountItem`
     guards the cursor (was a list-grow crash); `hostElementBody` + `forBlock` discard
     leftover server nodes.
   - **Dev DX:** warnings carry Svelte-5-style source locations (`file:line:col`) via a
     dev-only `__s.locs` table + per-element `__oct_loc` stamps. Recovery runs in dev + prod;
     warnings + LOC are dev-only, strictly gated so prod output is byte-identical.

   The React diff-matrix (`ReactDOMHydrationDiff` + `ReactDOMServerIntegrationReconnecting`)
   is now PORTED as `tests/conformance/hydration-mismatch.test.ts` (24 outcome-level cases),
   which surfaced + fixed 5 more runtime bugs (clone close-marker; ifBlock/switchBlock
   empty-branch cursor + leftover discard; setStyle + setClassName mismatch detection). The
   original "RESOLVED" label was a stale tag for the DECISION; the feature is now actually
   built — including the `@for`↔`@empty` toggle and same-root-but-different-nested-structure
   branches. Documented intentional divergences: octane patches attribute mismatches to the
   client value (React keeps the server value); it warns + rebuilds in place rather than
   throwing + re-rendering the boundary; and function components carry hydration markers, so a
   component-form does not silently reconnect to a bare-element-form of the same markup.
3. **Default transition indicator / `useMemoCache`** — still to confirm existence in
   Octane; skip their files if absent (low priority, does not block P0/P4).

### Execution kickoff — RESOLVED: start **P0 + P4** in parallel.
P0 infra (node-identity harness, effect-log helper, scaffold script) and P4
controlled-inputs (Tier 3) begin immediately; other tiers follow per §5.

---

## 7. Headline numbers

- React in-scope test files mapped: ~95 of ~230 (the rest are class/legacy/RSC/Fizz/
  Profiler/SuspenseList/ViewTransitions — documented divergences).
- Largest untested surface in Octane today: **controlled inputs** (Input 120 + Select
  62 + Textarea 60 + Option 12 ≈ 254 React `it`s, currently 0 Octane tests) and the
  **DOM event-delegation matrix** (EventPropagation 89 + EventListener 24).
- Highest-risk *correctness* gap: **keyed-reorder move parity** (Tier 0) — silently
  divergent today because the differential rig is innerHTML-only.

---

## 8. Execution progress

### P0 — infrastructure (DONE)
- **Node-identity reconciler harness** — `tests/conformance/_helpers/identity.ts`
  (`snapshotKeyed` / `diffIdentity` / `expectIdentity`). Classifies each keyed child
  as preserved / remounted / added / removed across a reorder. Asserts the
  renderer-agnostic contract (survivor identity + final order), NOT the move sequence
  (per §6.1).
- **Effect-log helper** — `createLog()` in `tests/_helpers.ts`, the standard
  substitute for React's `Scheduler.log([...])` ordering assertions.
- **Scaffold script** — `scripts/scaffold-react-port.mjs`. Turns a React test file
  into a triaged `describe` skeleton (`it.todo` for in-scope cases citing the source
  line; out-of-scope cases listed with the skip reason). Verified triage:
  ReactMultiChildReconcile 28/29, ReactFragment 24/24, ReactMemo 8/14,
  ReactNewContext 22/31 in scope.

### Tier 0 — keyed identity battery (DONE, passing)
`tests/conformance/multichild-identity.test.ts` (+ fixture
`tests/_fixtures/multichild-identity.tsrx`) ports 6 `ReactMultiChildReconcile`
behaviors (reverse/cycle/insert/prepend+append/remove preserve survivors;
removed-then-readded remounts). **All pass** — confirming Octane's LIS reconciler
honors React's identity contract even though its move *pattern* diverges.

### Tier 3 — controlled inputs: REVERTED (intentional divergence)
A first controlled-input slice was authored and **surfaced that Octane has no
controlled form-element model** — `value`/`checked` are plain attributes
(`setAttribute(el,'value',…)` guarded by a prop-diff), never re-asserted as DOM
properties, so React's controlled-revert / `defaultValue` / `<select value>` /
`<textarea value>` semantics don't apply. **Per maintainer guidance (2026-06-24),
controlled components + synthetic `onChange` are NOT a target** — they were removed
(`controlled-inputs*.test.ts` + fixtures deleted) and recorded as an intentional
divergence in §2 / Tier 3. The valuable artifact that survived: the empirical proof
of Octane's native/uncontrolled model, captured in §2.

### Tier 3 — portal event bubbling (DONE, working incl. nested)
`tests/conformance/portal-bubbling.test.ts` (+ fixture
`tests/_fixtures/portal-bubbling.tsrx`). Octane bubbles delegated events along the
**logical** tree via `$$portalParent` stamping (runtime.ts:2915 / :3119). Confirmed:
a click in a **doubly-portaled** node fires every handler on its logical-ancestor
path in order (`btn→mid→root`), and `stopPropagation` at a middle logical parent
halts the bubble — both passing. Existing `tests/portal-events.test.ts` already
covers single-level bubble-out, stopPropagation, two-portals-same-target, and
unmount detach. **No gap here — portal bubbling works as intended.**

### Batch-1 workflow ports (8 clusters, all green; reviewed)
A parallel workflow ported 8 more behavior clusters into `tests/conformance/`, each
self-verified green and adversarially reviewed for fidelity:

| Cluster | Result | Gaps pinned (it.fails) |
|---|---|---|
| `effect-ordering-deletion` | 6 pass | **0 (FIXED)** — was child-first; runtime now fires deletion cleanups parent→child to match React (see "Runtime fix" below). |
| `memo-bailout` | 3 pass | 0 — Octane matches props-equality bailout, context-defeats-bailout, custom comparator. |
| `context-bailout` | 5 pass | **0 (FIXED)** — context change now reaches consumers via lazy descend without re-rendering the bailed memo boundary (see "Runtime fix" below). |
| `multichild-remount` | 5 pass | 0 — same-type+key updates in place; type/key change remounts. |
| `useid-determinism` | 4 pass | **0 (FIXED)** — client `_idCounter` reset to 0 in `hydrateRoot()` so server≡client (see "Runtime fix" below). |
| `error-effects` | 4 pass | 0 — `@try`/`@catch` catches errors thrown in `useEffect`/`useLayoutEffect`; hook order preserved after catch. |
| `sync-store-tearing` | 6 pass | 0 — `useSyncExternalStore` consistency + no-infinite-loop on store-ref change. |
| `controlled-inputs-extra` | — | removed with the controlled-input revert. |

### Runtime fix — deletion-cleanup order (DONE)
**`unmountScope` + `fireCleanupsOnly` now fire a scope's own cleanups BEFORE
recursing into children** (pre-order = parent→child), matching React's
`commitDeletionEffects` walk. Previously they recursed first (post-order =
child→parent), the reverse of React. Within a scope, cleanups still fire in
reverse-mount (LIFO) order; the DOM range is still attached when a parent's
layout cleanup runs (removed by `unmountBlock` afterward), so a parent cleanup can
still observe its children's nodes — exactly as in React. Covered both deletion
paths: full unmount (`unmountScope`) and keyed-list clear (`fireCleanupsOnly` via
`batchClearItems`). The previously-divergent `scheduler-priority.test.ts` pin was
flipped to assert parent-first. **No regressions across the suite.**

**All discovered gaps are now fixed.** The 3 deletion-order, 1 context-bailout, and
1 useId gaps were resolved in the runtime; the 6 controlled-input it.fails were
removed as out-of-scope.

### Runtime fix — useId server≡client (DONE)
`hydrateRoot()` resets the client's monotonic `_idCounter` to 0 before rendering, so it
aligns with the server's per-`render()` reset. Hydration renders the same tree in
the same depth-first order, so ids now match byte-for-byte (`:in-0:`, `:in-1:`, …).
Verified by a real server-render → `hydrateRoot()` test that captures the id the CLIENT
computed (via an `onId` callback) and asserts it equals the server's, after warming
the counter so the test actually exercises the reset.

### Runtime fix — lazy context propagation through bailed memo (DONE)
Previously a context change defeated the memo bailout on EVERY memo boundary on the
path to a consumer (push-cascade), re-rendering bailed-out indirections. Now
`componentSlot` distinguishes a memo'd **direct consumer** (re-runs — `$$ctxDirect`)
from a memo'd **pure indirection** (bails its body, then `refreshContextConsumers`
descends into only the child blocks that actually consume the changed context —
`$$ctxReads`). Matches React's `['App','Consumer']` (no `Indirection`). The descend
handles `componentSlot`, `@if`/`@switch`, `@for` items (non-memo branches recurse;
memo branches prune via `$$ctxReads`), and lite consumers (their block carries
`$$ctxDirect`, so it re-runs — a safe cascade fallback). No regression across the
full context suite (context, components-context, hook-fixes memo-through-context,
suspense-extra, the new Case D for `@for`/`@if` descent).

### Tier 5 — transition REPLACE-suspend hold + off-screen rendering (DONE)
A transition that SWAPS in a new subtree which suspends now keeps the prior content on
screen (React's transition+Suspense contract). octane previously held only for an
IN-PLACE re-suspend; a component/branch REPLACE that suspended on mount tore the old
content down first → blank. **Runtime fix:** per-swap **off-screen (WIP-model)**
rendering — `renderOffscreen`/`commitOffscreen`/`disposeWip` + a `WIP_CAPTURE` effect/
ref buffer, wired into all four swap sites (`componentSlot`, `childSlot`, `ifBlock`,
`switchBlock`). On a transition swap the new subtree renders off-screen (effects
captured); completes → atomic commit + tear down old; suspends → discard partial +
re-throw so the enclosing `@try`'s EXISTING transition hold keeps the old content live
and resumes. Urgent + hydration keep the legacy path. This closed the `@octanejs/router`
concurrent-navigation gap (its `it.fails` flipped to passing). Validated by differential
(React-oracle) tests for childSlot + ifBlock + nested-Suspense, and direct tests for
switchBlock + componentSlot(router) + portal-in-WIP. Documented scope: per-swap, not a
global double-buffered tree (SUSPENSE_DIVERGENCE.md #4). **Still open in Tier 5:**
effects-semantics, reveal-throttle, async-actions, Activity ports + the fidelity audit.

**Tier 5 port — findings so far (in progress):**
- **Rig limitation discovered:** `@tsrx/react` compiles octane's `@pending` arm to a
  FUNCTION-valued `fallback` prop (`fallback={() => el}`), which React does not render —
  so the differential rig's React side shows EMPTY for any `@pending` fallback state.
  The rig therefore CANNOT oracle suspense fallback states (only held-content / resolved
  states — which is why the transition-swap differentials, comparing HELD content, are
  valid). Suspense-fallback parity must stay hand-ported (octane-direct).
- **Gap found AND FIXED — effect lifecycle under suspense:**
  `conformance/suspense-effects-semantics.test.ts` (per
  `ReactSuspenseEffectsSemantics-test.js:611`). Porting it surfaced that octane
  PRESERVED a re-suspended boundary's effects (softDetach keeps hooks) where React
  DESTROYS layout/passive effects on hide + recreates on reveal. **Runtime fix:** the
  suspend-hide paths (`handleSuspense` softDetach + `swapToPendingFallback`) now run the
  hidden subtree's effect cleanups via `deactivateScope` (which also clears deps), and
  `attachResume`'s retry now COMMITS the resume's effects (`commitEffects`) so the
  recreated layout effects drain (without it the scheduler stayed non-quiescent — a
  latent resume-doesn't-commit-layout-effects bug this surfaced). State is still
  preserved across suspend. Passing `it` (no pin); 86 suspense/transition/activity
  tests green, 0 regressions.
- **effects-semantics ported (3 cases, passing):** re-suspend destroy/recreate
  (`:611`), destroy-ONCE across multiple suspend points incl. partial resolve (`:2438`),
  and nested-boundary isolation (`:1138`). The multi-place case surfaced + fixed a
  second latent bug: a re-suspend DURING a resume left the now-hidden subtree's enqueued
  layout effects stuck (scheduler never quiesced) — fixed by marking the hidden tryBlock
  `inactive` (so `drainPhase` skips them) and committing effects on BOTH retry paths.
- A React v19.2.7 reference clone (test sources) is used for faithful porting.
- **Refs under suspense — FIXED + ported (`:2877`, `conformance/suspense-refs.test.ts`):**
  a suspended boundary's host refs are now detached on hide (object refs → null, callback
  refs called with null) and re-attached on reveal, matching React's "refs cycle like
  layout effects" contract even though octane preserves the DOM node. `detachSubtreeRefs`
  runs only on the suspense-hide path (not `<Activity>`, which keeps refs); reveal
  re-attaches the captured `{ref, el}` pairs before layout effects fire. Covers the
  compiled template host-ref path + de-opt host slots; refs attached purely through
  closures (spread / de-opt prop path / fragment refs) are a documented narrow limitation.
- A React v19.2.7 reference clone (test sources) is used for faithful porting.
- **Effect ordering — FIXED + ported (`conformance/effect-order.test.ts`):** all three
  effect phases now drain in React's true POST-ORDER (descendant-before-ancestor via the
  block tree; disjoint subtrees in enqueue/tree order) instead of a global deepest-first
  depth sort. The old sort mis-ordered a shallow node in an earlier sibling subtree
  against a deeper node in a later one; post-order matches React's commit walk. Each
  `PendingEffect` carries a monotonic enqueue `seq` (DFS pre-order); `comparePostOrder`
  turns `seq` + the `parentBlock` chain into post-order. The deferred ref-attach queue
  shares the same `seq` counter + comparator, so refs attach child-first / in tree order
  too. Full suite green, zero regressions; the nested-boundary effect test now asserts
  real order (workaround removed). Pinned by `conformance/effect-order.test.ts`.
- **Global commit coordination — DONE for #1 + #4 (`conformance/entangled-commit.test.ts`,
  flipped `transitions.test.ts` entangled test):** a single `startTransition` that fans
  out to multiple suspending boundaries now holds EVERY prior screen until all are
  data-ready, then reveals them together (React's atomic-commit contract). Implemented as
  a data-ready barrier in runtime.ts: `HELD_TRANSITIONS` tracks boundaries holding prior
  content; each stages its reveal as its data resolves; when `STAGED_REVEALS.size ===
  HELD_TRANSITIONS.size` the batch flushes in one commit. `commitResume` was extracted
  from `attachResume`'s retry; abandon paths (urgent supersede / error / unmount) drop a
  boundary from the group so the rest aren't stranded. Divergences #1 and #4 closed; full
  suite green, zero regressions.
- **#5 reveal throttling — investigated and DISMISSED (octane matches default React).**
  The provisional divergence used the wrong oracle (the `-test.internal.js` suite). The
  public default-flags test `ReactUse-test.js:1096` reveals `A(Loading B...)` immediately
  on a nested reveal — exactly octane's behavior — and the throttle assertions are gated
  behind `alwaysThrottleRetries` (OFF by default). Implementing the throttle would DIVERGE
  from default React (and break the correctly-ported `ReactUse:1096` test), so it's
  intentionally not done. SUSPENSE_DIVERGENCE.md #5 reclassified from "open" to "dismissed".
- **`ReactAsyncActions` + `Activity` deeper cases — ported.** `useOptimistic` rebasing
  (passthrough change mid-action), custom reducers, and repeated updates in one action all
  match React (`conformance/async-actions.test.ts`). `<Activity>` reveal-outer-without-inner
  and child-first-mount / parent-first-hide cleanup order match React (`activity.test.ts`).
  Two narrow divergences surfaced and were documented (not pinned): async-action
  transition entanglement (#6 — a non-optimistic intermediate transition update commits
  eagerly instead of being held until the action settles) and `useInsertionEffect` toggling
  under `<Activity>` (#7). Both are rare edges where a fix risks the working optimistic flow
  / touches the effect-slot shape; deferred.
- **Fidelity re-audit — DONE.** Every existing suspense/transition/activity/actions test
  (~80 across 16 files) was cross-referenced against the React v19.2.7 clone (4 parallel
  read-only audits). Result: NO "cheating" — no test encodes octane-current behavior as
  React parity, and no assertion is softened where React asserts order/exact output. The
  only fixes were citation hygiene: 5 stale line numbers in `transitions.test.ts` (pointed
  at blank/log lines after React-version drift), 6 imprecise cites in `suspense-extra.test.ts`
  (paraphrased titles → real `ReactUse`/`ReactSuspense` tests or honest rewordings), and one
  stale "// gap" comment in `suspense-effects-semantics.test.ts` (the gap was since fixed).
  Behaviors were unchanged (comment/citation-only edits). octane-specific regression
  fixtures (`nested-suspend`, `consecutive-suspend`) are honestly labeled as such.

### Suite status
**204 test files, 1074 passed, 0 expected-fail, 0 regressions** (after the off-screen
transition fix). Typecheck + format clean. (Earlier checkpoint: 106 files / 752.)
