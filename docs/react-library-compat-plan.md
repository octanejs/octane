# Validating Octane via real React libraries — plan

> Goal: measure how faithfully Octane matches React's hook/effect/store/context/
> Suspense surface by porting **real third-party React libraries** and running a
> representative slice of **their own test suites** — with React (compiled from the
> same `.tsrx`) as a live byte-for-byte oracle.

## 1. The honest reframe

"Just rename `react` → `octane` and it renders" is **false** for Octane, and the
reason is architectural: **Octane is a compiler framework, not a runtime VDOM.**

- `createElement(type, props)` returns only a flat `{ $$kind, type, props }`
  descriptor (`runtime.ts:3193`) — no children tree, and there is **no
  `jsx-runtime`**. DOM is produced by compiled `.tsrx` templates doing imperative
  `clone`/`child`/`sibling`/`setText` ops.
- Every hook is bound to a **compiler-injected `Symbol` slot** passed as a trailing
  argument; a React-emitted slotless `useState(0)` throws `missingSlot()` immediately.
  (This call-site identity is also *why there are no rules of hooks*.)

So Babel/tsc-compiled React **component** code (nested `jsx()` calls, slotless hook
calls) cannot run on Octane at all. The "rename imports" idea is only valid for the
**logic layer**:

> Reuse a library's **framework-agnostic core** (store/atom/machine/reducer/
> query-client/form-control — zero React imports) **verbatim** → re-implement its
> **thin React binding** (a handful of hooks, almost all built on
> `useSyncExternalStore`) against Octane's identically-named hooks → **re-author** a
> representative slice of its **test components in `.tsrx`** and run them, ideally
> through the differential rig.

A pass-rate then measures real-world hook parity, **not** whether React renders
unchanged.

## 2. Strategy (three legs, applied per library)

1. **Core reuse** — import the library's vanilla kernel unchanged (it imports nothing
   from React, so it runs on Octane as-is). Its existing pure-logic unit tests run as
   a free green baseline.
2. **Binding re-implementation** — re-author the thin React binding against Octane
   hooks. Almost everything reduces to
   `useSyncExternalStore(subscribe, getSnapshot[, getServerSnapshot])` (Octane ships a
   full React-19-shape, tearing-tested implementation) plus
   `useState`/`useReducer`/`useEffect`/`useLayoutEffect`/`useMemo`/`useCallback`/
   `useRef`/`useContext`/`createContext`/`use`/`createPortal`/`flushSync`. **Only two
   symbols are missing:** `useDebugValue` (no-op stub) and `forwardRef` (rewrite to
   React-19 refs-as-props).
3. **Test porting** — re-author a representative slice of the library's tests in
   `.tsrx` and route each case to the right harness:
   - **DOM output over an event sequence** → the **differential rig**
     (`mountDifferential`): same `.tsrx` compiled to both Octane and React, byte-equal
     `innerHTML` after each `step()`, React is the oracle, divergence throws.
   - **Render-count / selector-bailout / subscription bookkeeping / effect order** →
     **Octane-only conformance** (`mount`/`act`/`flushEffects`/`createLog`) — the rig
     is `innerHTML`-only and **blind** to these.
   - **Keyed-reorder node identity** → the **identity harness**
     (`snapshotKeyed`/`diffIdentity`) — Octane's LIS reconciler moves a *different set*
     of nodes than React's `lastPlacedIndex` even at identical final DOM.

## 3. Ranked targets

| # | Library | Effort | Why it's here | What passing proves |
|---|---|---|---|---|
| 1 | **zustand** | S | Binding is literally `useStore = useSyncExternalStore(api.subscribe, () => selector(api.getState()))`; vanilla `createStore` is pure; clicks only — **runs on the existing rig with zero harness work**. | `useSyncExternalStore` honors React 18/19's external-store contract under a real, widely-deployed binding. |
| 2 | **valtio** | M | `useSnapshot` = uSES + useMemo + useRef + useLayoutEffect; Proxy access-tracking populated by **synchronous** render-body/text-hole reads. | layout-effect-after-DOM ordering; Octane evaluates setup scope + `{expr as string}` synchronously; render-optimization bail-out (via a render-counter conformance test). |
| 3 | **jotai** | M | Binding is `useReducer` + `useEffect(store.sub)` (**not** uSES) → validates a different subscription path + re-render minimization. | useReducer force-update + useEffect lifecycle; write-only `useSetAtom` non-rerender; derived-atom bail-out. |
| 4 | **react-redux** (hooks only) | M | The canonical selector-memoization + custom-equality bail-out + context-store pattern the ecosystem copies. | uSES + useContext + useMemo/useCallback/useRef compose into selector-with-equality bailout. *(Exclude `connect()`.)* |
| 5 | **@xstate/react** | M | Whole `xstate` reused unchanged; binding is useState-lazy + effect lifecycle + uSES + selector shim. | effect-driven subscribe/unsubscribe timing; selector bailout under a real machine core. |
| 6 | **@tanstack/react-query** | L | `query-core` (v5, no react-dom) reused; binding adds 3-arg uSES + context + Suspense throw-to-suspend. **Strongest end-to-end proof** (store + context + suspense). | getServerSnapshot, suspense throw/reveal, context — but async-heavy. |
| 7 | **react-hook-form** | L | First lib that exercises Octane's **divergences as strengths**: uncontrolled inputs, native delegated input/change/blur/submit, callback-ref attach/detach timing. `createFormControl` engine (~1.3k LOC) is pure. | the least-tested, highest-value ref-and-native-event workload, with React as oracle. |
| 8 | **@floating-ui/react** | L | refs-as-props + native events + portal + useId + layout-effect, in aggregate. `@floating-ui/dom` core is vanilla. | binding plumbing (refs/effects/portal/events/state). *Not* positioning (jsdom has no layout). `flushSync` re-entrancy from an effect is the likely snag. |

*(Deliberately deferred / out of first slices: `connect()` HOC, valtio
`proxyMap`/`proxySet`, RHF `useFieldArray` identity, FloatingFocusManager, downshift
legacy class render-prop, usehooks-ts DOM hooks gated on jsdom matchMedia/observer
fidelity.)*

## 4. Harness pieces to build

- **Native non-click event drivers** on the rig: `input`/`change`/`blur`/`keydown`/
  `pointerdown`/`submit` helpers that dispatch the *same* native event on the matched
  element in **both** containers before the diff. (`delegateEvents` already lists
  click/input/change/keydown/submit.)
- **Async `step` variant** that advances fake timers and drains **both** runtimes
  (`drainPassiveEffects` + React `act`) + microtasks before comparing — for
  promise/timer libraries (Query, xstate delays). Force notification batching
  synchronous so commit boundaries line up.
- **Binding-alias resolution** in `_setup.ts` / the Vite plugin: a library specifier
  appearing literally in a `.tsrx` resolves to the **Octane** binding on the Octane
  side and the **React** binding on the React side (mirrors the existing
  `octane → react` rewrite).
- A reusable **no-op `useDebugValue` shim** module imported by every binding.
- A **render-count conformance pattern** (`createLog` + effect counter, or a counter
  prop projected to DOM text) for the bail-out behaviors the `innerHTML` rig can't see.
- A **vanilla-core vendoring convention** so each library's kernel is pulled in
  unchanged and its pure unit tests run as a baseline.
- A shared **`useSyncExternalStoreWithSelector` reimpl** (over Octane
  useRef/useMemo/useEffect/uSES) for zustand-traditional, react-redux, xstate.

## 5. Phases

- **P0 — Bootstrap (1–2d):** audit existing assets (rig, `_setup.ts` rename mechanics,
  conformance + identity helpers, the two existing store fixtures), add the
  `useDebugValue` shim, decide the binding-alias mechanism, set the citation
  convention (each ported `it(...)` → a `step()` name).
- **P1 — Zustand (2–3d):** the zero-friction proof on the existing click-only rig.
  Lands a real third-party pass-rate fast and validates the whole methodology.
- **P2 — Valtio + Jotai + react-redux + xstate (1.5–2wk):** the uSES/subscription
  cohort. Adds the binding-alias + render-count conformance + `{sync:true}` fixtures;
  per-library pass-rate table.
- **P3 — Harness extension (1wk, overlaps):** native event drivers + async step.
- **P4 — TanStack Query (1–1.5wk):** strongest end-to-end (store + context + suspense);
  share one `QueryClient` across both rig sides; settle-then-compare.
- **P5 — react-hook-form + @floating-ui/react (1.5–2wk):** refs/native-events/portals/
  uncontrolled.
- **P6 — Scorecard & divergence ledger (3–4d):** per-library matrix; classify each
  fail as **(a) genuine Octane bug**, **(b) intentional divergence**, or **(c) jsdom/
  environment artifact**; roll up a "real-world React-binding parity %" with caveats;
  feed genuine bugs back as regression fixtures, record divergences in
  `react-parity-migration-plan.md`.

## 6. What a pass-rate proves — and doesn't

**Proves** (React as live oracle, real third-party code): `useSyncExternalStore`
external-store contract (subscribe/unsubscribe, fresh getSnapshot per commit,
getServerSnapshot, tearing prevention, store-swap re-subscription); commit/batching
timing; effect ordering (child-first mount, parent-first deletion); useState lazy-init,
useReducer force-update, useMemo/useCallback/useRef identity, useContext propagation,
`use()`/Suspense throw-to-suspend+reveal, useId stability, native delegated events,
callback-ref timing, createPortal bubble-out, and the form-control model
(uncontrolled at the time; controlled `value`/`checked` shipped 2026-07-08) —
for the cases these libraries actually depend on.

**Does NOT prove:** that React **components** run unchanged (they're re-authored in
`.tsrx`); runtime-VDOM features Octane lacks by design (synthetic `onChange`,
`forwardRef`, StrictMode double-invoke, class components, RSC/
Fizz/SuspenseList, react-dom internals/test-renderer — controlled-input
reassertion was on this list until the 2026-07-08 reversal shipped it); pixel positioning (no jsdom
layout); concurrent mid-render interleaving (Octane is synchronous); and the **specific
set of physically-moved nodes** in keyed reorders (LIS ≠ React; final DOM identical,
move set not — `innerHTML` can't see it).

Every failure is triaged as **bug vs intentional-divergence vs environment-artifact**
before it counts against parity.

## 7. Key risks

- **Partly circular:** Octane already ships uSES + ported React's `useSyncExternalStore-test.js`,
  so the base shim proves little new — weight scoring toward the *with-selector* layer,
  real bindings, and render-count/bailout behavior.
- **Rig is `innerHTML`-only** → blind to render-counts, selector/proxy bailout, and
  keyed move-sets (the headline optimizations of valtio/redux/RHF). Needs dedicated
  conformance/identity tests or these silently "pass".
- **jsdom fidelity** is the confounder (focus/activeElement/relatedTarget, layout/
  getBoundingClientRect, matchMedia/observers, MutationObserver) — can masquerade as
  Octane bugs. Defer + triage.
- **Async libraries** need deterministic timer-advance + dual-runtime draining or
  snapshots race.
- **StrictMode render-count expectations** in upstream tests assume double-invoke;
  Octane's counts are cleaner (a plus) but expected numbers must be adjusted.
- **Authoring tax is real:** `.map()`→`@for(key)`, class ErrorBoundary→`@try`,
  `renderHook`→DOM-projecting `.tsrx` wrapper, `forwardRef`→refs-as-props. "Port the
  suite" is really "rewrite a curated slice" — pass-rate is over that slice, disclosed.
- **`flushSync` re-entrancy from an effect** (floating-ui) is the likeliest hard snag.

## 8. First concrete step — Zustand

No new harness needed. Against the existing click-only differential rig:

1. `tests/_vendor/zustand/vanilla.ts` (zustand's `createStore`, unchanged) +
   `binding.ts` implementing `create`/`useStore` as
   `useSyncExternalStore(api.subscribe, () => selector(api.getState()))` + a no-op
   `useDebugValue` shim.
2. `tests/_fixtures/zustand-counter.tsrx` (modeled on `sync-external-store.tsrx`):
   ```tsrx
   function Counter(props) @{
     const n = useStore(props.store, (s) => s.count);
     <div>
       <p class="value">{n as string}</p>
       <button onClick={() => props.store.setState((s) => ({ count: s.count + 1 }))}>{'inc'}</button>
     </div>
   }
   ```
   plus a multi-consumer / selector-bailout sibling fixture.
3. `tests/differential/zustand.test.ts` → `mountDifferential('_fixtures/zustand-counter.tsrx', 'Counter', { store })`,
   asserting byte-identical `innerHTML` via `step()` after each click (React = oracle).
4. `tests/conformance/zustand-conformance.test.ts` → subscribe-on-mount /
   unsubscribe-on-unmount (`listenerCount`) + selector-equality re-render suppression
   (`createLog`).

This lands a real third-party-binding pass-rate immediately and proves the methodology
end-to-end with zero harness work.
