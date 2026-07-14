# View Transitions — React-parity plan

Status: COMPLETE — all phases (0-5) LANDED 2026-07-11/12. Every in-scope test
from ReactDOMViewTransition-test.js (25) AND ReactDOMFizzViewTransition-test.js
(4) is ported and passing. Phase 5: SSR `vt-*` annotations (server
ViewTransition + ssrTry claim hooks in runtime.server.ts — arm-top detection
is POSITIONAL via vt-enter-x/vt-exit-x candidate attributes claimed by each
@try arm's first element and stripped at emission, exact where flag-based
tracking couldn't be; auto names `_O<frame-path>_` are stable across
streaming passes so fallback/content captures pair; streamed segment chunks
inherit the wrapping boundary's name/share/update), the user doc
(docs/view-transitions.md), and the website demo route (/view-transitions —
enter/exit, shared-element morph, addTransitionType tabs; driven by the
real-browser e2e; needed BOTH the app-router entry and the plugin-level
octane.config.ts RenderRoute — the catch-all otherwise serves it with a 404
status). Follow-up polish on 2026-07-14 moved that live demo into the Core APIs
guide at `/docs/core-apis` and removed the standalone route and nav item. Phase
4: parent enter/exit relays SHIPPED (React's
`enableViewTransitionParentEnterExit` is ON in the experimental channel, so
this is live behavior, not a pin): `parentEnter`/`parentExit` class props +
`onParentEnter`/`onParentExit` callbacks; a nested boundary in a unit that
entered/exited as a whole relays when every STRICT intermediate boundary
participates (relay prop or handler, not resolving 'none' — a prop-less
intermediate breaks the chain, plain DOM never does) and the unit's outermost
genuinely activates (not 'none', not share-consumed; share also wins over the
nested boundary's own relay). Exit-side relays reuse the pre-drain recs
(pre-named); enter-side relays mint recs post-drain. vtPreClass gained
parentExit in its chain and vtAllNone counts parentExit participation.
Phase 3: Suspense reveal commits
(standalone `commitResume` + the entangled `flushStagedReveals` batch, which
animates as ONE transition) route through the controller via `vtFlush(work)`;
nested-unit suppression (only the OUTERMOST of boundaries inserted/removed
together fires — nearest-boundary-ancestor walks against the entered set /
the disposed flag; share pairing gets first claim on named nested exits);
`render()` inside a transition schedules at transition priority instead of
committing synchronously (closing the Phase-1 root-mount gap — boundaries
mounting with initial content enter-animate, which is what makes the
Suspense-reveal conformance test's fallback-enter arm hold); passive effects
scheduled mid-animation defer to `finished` (scheduled path only — direct
test-harness drains stay ungated); update detection compares element
IDENTITY (a fallback→content swap of same-count elements activates). A
reveal that mounts the app's first-ever boundary is a documented miss
(vtWouldWrapResume gates on VT_REGISTRY.size > 0). Phase 2: shared-element
pairing
(same-named exit+enter in one commit → ONE `share` activation fired on the
EXITING side, suppressing its exit and the enter side's enter; viewport decay
via pre-drain exit rect + post-drain enter rect), `addTransitionType` (+
`unstable_` alias; types captured per batch by vtFlush, cleared by unwrapped
transition drains too), class resolution (`string | 'auto' | 'none' |
per-type map` against batch types; applied as `view-transition-class`
alongside the name; `'none'` suppresses activation — fully-inert boundaries
skip pre-naming, which is the only capture-correct suppression), and the full
callback contract (`(instance, types)`, instance = name + `.animate()`-capable
`old`/`new`/`group`/`imagePair` `ViewTransitionPseudoElement` handles; a
returned cleanup runs before the boundary's next activation). Phase-2 note:
pre-drain class application resolves kind-agnostically (share→exit→update→
default chain) because a live boundary's fate is unknown until the drain runs
— per-kind exactness for exits/updates in the OLD capture is a render-first
luxury; documented, revisit only if a test pins it. Phase 0: conformance
skeletons
(`tests/conformance/view-transition.test.ts` + `view-transition-ssr.test.ts`)
+ the jsdom mock helper. Phase 1: the core runtime — `ViewTransition` builtin
(tier-1 export + `unstable_ViewTransition` alias), boundary registry +
enter/exit/update activation, setText dirty tracking + rect diffing, the
`vtFlush` controller wrapping transition drains in
`document.startViewTransition` (sync fallback, `flushSync` skip, one-at-a-time
batching), auto name assignment/revert, `onEnter`/`onExit`/`onUpdate`
callbacks, the compiler's `_$vtSeen()` module-load hint + boundary-name M3
exclusion, and the transparent SSR twin with both-sides inherit-decline. Five
conformance ports flipped from todo. Phases 2-5 pending. Phase-1 notes:
`act()`'s sync drain loop routes through `flush()` when a wrap is due
(flushSync is the urgent path and skips); the root's FIRST `render()` is
synchronous (never queued), so an initial-transition root mount doesn't
enter-animate — the ported tests don't assert it (React's do via mockClear
patterns); revisit if a real test pins it. Owner doc for `<ViewTransition>` /
`addTransitionType` support; read with `docs/react-parity-migration-plan.md`
(its ViewTransitions row now points here).

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

Port via `scripts/scaffold-react-port.mjs` and cite source lines. Fix real gaps
before landing their tests; encode intentional divergences as ordinary passing
assertions with `// OCTANE DIVERGENCE:` rationale:

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
