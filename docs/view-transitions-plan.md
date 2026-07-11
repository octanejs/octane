# View Transitions — React-parity plan

Status: Phase 0 LANDED 2026-07-11 (conformance skeletons
`tests/conformance/view-transition.test.ts` [25 todos + 1 live harness pin] +
`view-transition-ssr.test.ts` [4 todos], mock helper
`tests/conformance/_helpers/view-transition-mocks.ts`, scaffolder's
ViewTransitions out-of-scope rule removed). Phases 1-5 pending. Owner doc for
`<ViewTransition>` / `addTransitionType` support; read with
`docs/react-parity-migration-plan.md` (its ViewTransitions row now points
here).

## 1. What React ships (the parity target)

React's View Transitions are **experimental-channel** (`unstable_ViewTransition`,
`unstable_addTransitionType`, gated by `enableViewTransition`). The API drives
the browser's same-document View Transitions
(`document.startViewTransition`) from the declarative tree:

- `<ViewTransition>` marks a boundary. Props: `name` (manual, for shared
  transitions; auto-generated otherwise), `enter` / `exit` / `update` /
  `share` / `default` — each `"auto" | "none" | "<class>"` or a
  per-transition-type object `{ 'nav-back': 'slide-right', default: 'auto' }`
  — plus callbacks `onEnter` / `onExit` / `onUpdate` / `onShare`
  (`(instance, types) => cleanup`).
- **Activation** (only inside transitions: `startTransition`,
  `useDeferredValue`, Suspense reveals):
  - `enter` — the boundary's subtree is newly inserted.
  - `exit` — the subtree is deleted.
  - `share` — a `name` appears on BOTH a deleted and an inserted boundary in
    the same commit (shared-element pair; wins over enter+exit; both sides
    must be in-viewport or it decays to separate enter/exit).
  - `update` — DOM mutations inside the boundary, or the boundary's own
    size/position changed (React measures rects), including reorders.
    Mutations activate the INNERMOST enclosing boundary only.
- **Mechanics**: before snapshotting, React assigns `view-transition-name`
  (unique auto names; suffixes when a boundary has several top-level DOM
  children) + the resolved class to activated boundaries, calls
  `document.startViewTransition({ update })`, applies ALL DOM mutations inside
  `update`, then after the transition's `ready` promise reverts the names and
  fires the callbacks; passive effects wait for `finished`.
- **Ordering contract** (react.dev): snapshot → mutations + insertion effects
  → fonts wait → layout effects + refs → measure → `ready` → revert names +
  fire on\* callbacks → `finished` → passive effects.
- **Batching/interrupt**: one view transition at a time — work arriving while
  one is animating batches and runs AFTER it (A→B then B→D, never A→D);
  `flushSync` mid-transition skips it (`skipTransition()`); no
  `document.startViewTransition` (Firefox pre-139, jsdom) → apply
  synchronously with no animation. No automatic `prefers-reduced-motion`
  handling (userland CSS).
- Out of experimental even in React: gesture transitions
  (`unstable_startGestureTransition`, `useSwipeTransition`) — **explicitly out
  of scope here** until React stabilizes them.

## 2. Conformance anchors (the user-facing spec is React's tests)

Port via `scripts/scaffold-react-port.mjs`, cite source lines, pin real
divergences `it.fails` + `// GAP` per the conformance convention:

| React test file | size | scope |
| --- | --- | --- |
| `react-dom/src/__tests__/ReactDOMViewTransition-test.js` | 26 its | THE suite: callbacks (onEnter/onExit/onUpdate/onShare), Suspense reveal enter, nested-boundary unit-removal, shared pairs, and 15 its behind `enableViewTransitionParentEnterExit` (onParentEnter/onParentExit relays) |
| `react-dom/src/__tests__/ReactDOMFizzViewTransition-test.js` | 4 its | SSR annotations for boundaries that animate on stream-in/hydration reveal |
| `react-dom/src/__tests__/ReactDOMHostComponentTransitions-test.js` | small | triaged OUT in Phase 0: both its cases are Float/hoistable-resource error tests, nothing VT-specific survives |
| `react-reconciler/.../ViewTransitionReactServer-test.js` | — | RSC restrictions — OUT (no Server Components) |

React's own jsdom mock recipe (ReactDOMViewTransition-test.js:188-249) ports
verbatim to our vitest env and is the whole test-infra story:
`document.startViewTransition = ({update}) => { update(); return { ready:
Promise.resolve(), finished: Promise.resolve(), skipTransition() {} } }`,
`Element.prototype.getBoundingClientRect` returning content-length-derived
rects (so update-detection has signal), stub `animate`/`getAnimations`,
`document.fonts`, `CSS.escape`. Land as a shared helper in
`tests/conformance/_helpers/`.

## 3. The architectural decision (octane's commit model vs React's)

React renders concurrently FIRST, then wraps only its mutation commit phase in
`startViewTransition`. Octane has no separate mutation phase: `flush()` →
`drainQueue()` renders AND mutates the DOM in one eager walk
(`runtime.ts:861-887`); only effects are deferred (`effectQueues`,
`runtime.ts:549-559`).

**Decision: v1 wraps the whole transition drain inside the `update`
callback.** When a flush contains transition-lane work touching ≥1 mounted
`ViewTransition` boundary (and `document.startViewTransition` exists), the
scheduler routes that drain through the VT controller instead of draining
synchronously. Consequence: octane's render work runs while the browser holds
the old-state snapshot (React's runs before the snapshot). This is observable
only as snapshot-hold time; octane's render pass is typically far cheaper than
the animation budget. Documented as an **intentional divergence** (do not
"fix" toward React by inventing a staged-mutation reconciler mode — that
trades away the eager-mutation performance model for a timing nicety).

There is a SECOND commit path to route through the same wrapper:
`flushStagedReveals` (`runtime.ts:10498`) — the atomic held-transition reveal
for Suspense — is exactly the "content resolves → enter activates" moment.

## 4. Design

- **Boundary**: `export const ViewTransition` — a runtime builtin identified
  by function identity, joining `Suspense`/`ErrorBoundary` in the M3
  inherit-decline check (`runtime.ts:7214`) so its component slot always owns
  an exact DOM range (needed to enumerate top-level children for name
  assignment and to scope dirty-tracking). Tier-1 export in `index.ts`
  (React parity); also alias `unstable_ViewTransition` /
  `unstable_addTransitionType` so React-experimental imports port unchanged.
- **Dirty tracking**: the reconciler's DOM-op helpers (insert / remove /
  setText / attr / move) mark the nearest enclosing VT boundary via a
  render-walk stack. Fast path: a module-level `VT_MOUNTED_COUNT === 0` guard
  keeps the non-VT world at literally zero added work.
- **Activation resolution at flush end**: inserted-subtree boundaries → enter;
  deleted → exit; name-matched exit+enter → share (in-viewport check, decay
  rule); dirty or rect-changed survivors → update (innermost only). Rects of
  candidates measured once before `startViewTransition`, re-measured inside
  `update` after mutations.
- **Class/type resolution**: `addTransitionType(type)` accumulates on the
  current transition batch; class props resolve `string | auto | none |
  {type: class, default}` against the batch's types; `none` deactivates.
- **Names**: auto `⟨vt-N⟩` unique names per activated boundary, one per
  top-level DOM child (suffix `-1, -2…` for multiple), `view-transition-name`
  + `view-transition-class` applied pre-snapshot, reverted after `ready`.
- **Controller/queueing**: singleton in-flight transition; later transition
  flushes queue and run after `finished` (B→D batching). `flushSync` (and any
  discrete/urgent flush) while in-flight → `skipTransition()` + drain
  synchronously. No `startViewTransition` → straight sync drain (today's
  behavior, also the jsdom default without the mock).
- **Effect phasing on VT flushes**: mutations + insertion effects + layout
  effects/refs inside `update` (existing `commitEffects` order); the passive
  drain gates on `finished` (new); callbacks fire after `ready` with
  `(instance, types)` where instance = `{ name, old, new, group, imagePair }`
  pseudo-element handles (same shape as React: element + pseudoElement
  string, `.animate()`-capable) and returned cleanups run on next transition
  or unmount.

## 5. Phases (each independently landable)

- **Phase 0 — pin the spec.** Scaffold-triage the three DOM test files into
  `tests/conformance/`; land the mock helper; no runtime changes. Output: the
  triaged `it.todo` skeleton IS the refined scope.
- **Phase 1 — core.** Boundary builtin + identity/inherit-decline + dirty
  tracking + enter/exit/update activation on `startTransition` flushes + auto
  names + controller with sync fallback and `flushSync` skip. Flip the Phase-0
  todos covering mount/unmount/content-change callbacks (onEnter/onExit/
  onUpdate minimal) and the "no VT boundary → no `startViewTransition` call"
  negatives.
- **Phase 2 — share + types + full callbacks.** Named pairs (+viewport decay),
  `addTransitionType`, per-type class maps, `(instance, types)` callback
  contract with cleanups, class application/revert.
- **Phase 3 — Suspense + scheduling depth.** Route `flushStagedReveals`
  through the controller (reveal → enter; fallback swap semantics),
  `useDeferredValue` activation, B→D batching, passive-gating on `finished`,
  nested-boundary unit-removal semantics.
- **Phase 4 — parent enter/exit relays.** The 15 `enableViewTransitionParentEnterExit`
  its (onParentEnter/onParentExit chains, `none` breaking relays). React still
  flag-gates this — decide ship vs `it.todo`-pin when we get here based on
  where React's flag stands.
- **Phase 5 — SSR + polish.** Fizz-parity SSR annotations + hydration-reveal
  transitions (port the 4 Fizz its; `runtime.server.ts` pass-through today,
  annotations after), volar/type surface for the new props, user doc
  (`docs/view-transitions.md`), website demo route (real-browser validation —
  note the `/benchmarks` comment-ceiling re-base convention if the page adds
  weight), `pnpm parity:gaps` regeneration.

## 6. Expected divergences (candidate GAP pins, decided at port time)

- **Render-inside-update-callback timing** (§3) — intentional; snapshot-hold
  includes octane's render pass.
- **Reorder `update` activation set**: octane's LIS reconciler physically
  moves fewer nodes than React's `lastPlacedIndex` (documented divergence).
  Rect-based activation should converge the OBSERVABLE set (a survivor whose
  rect changed activates regardless of whether it was the node that moved),
  but any residual difference is pinned, not "fixed" toward React.
- **Discrete-event flushes** (octane's per-keystroke `onInput` commits) are
  urgent lanes — they never animate, matching React's sync-update rule.

## 7. Out of scope

Gesture transitions (`startGestureTransition` / `useSwipeTransition`), RSC
semantics, React Native, automatic reduced-motion handling (parity: userland),
and any octane-invented animation surface (tier-1 stays React-shaped;
`@octanejs/motion` remains the JS-driven alternative and is unaffected).
