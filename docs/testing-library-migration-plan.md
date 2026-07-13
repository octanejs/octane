# Octane Library Port Plan: React Testing Library

> Goal: let octane apps be tested with the familiar RTL API by porting
> **react-testing-library's thin React layer** onto octane and reusing the
> **framework-agnostic `@testing-library/dom` verbatim** — the same
> core-reuse / binding-reimplementation / test-porting strategy as the other
> `@octanejs/*` bindings (see `docs/react-library-compat-plan.md` §2).
>
> **Progress (2026-07-05):** `@octanejs/testing-library` **landed** — `render`
> (both octane authoring forms + `container`/`baseElement`/`wrapper`/`queries`/
> `hydrate` options, root reuse per container), `cleanup` (+ RTL-style
> auto-cleanup and act-environment arming via global test hooks), `renderHook`
> (committed-result recording from an effect, `initialProps`/`rerender`/
> `unmount`/`wrapper`, `withSlot`-pathed callback so unslotted binding hooks
> work), `act` re-export, and the dom-testing-library config wiring
> (`eventWrapper` → `flushSync` + effect settle, `asyncWrapper` →
> act-environment suspension, `unstable_advanceTimersWrapper` → octane `act`).
> 40 tests port the representative RTL slice (render.js, rerender.js,
> multi-base.js, cleanup.js, auto-cleanup.js, events.js, renderHook.js, act.js,
> end-to-end.js + a Suspense reveal), cited per the conformance convention
> against react-testing-library@be9d81d.

## 1. Architecture — what is reused vs ported

RTL is already layered the way §2 of the compat plan wants:

| Layer | RTL | `@octanejs/testing-library` |
| --- | --- | --- |
| Queries, `screen`, `within`, `waitFor`, `findBy*`, `fireEvent`, `prettyDOM`, `configure` | `@testing-library/dom` | **reused verbatim** (dependency + `export *`) |
| `render` / `cleanup` / `renderHook` | `ReactDOMClient.createRoot` + `act()` per operation | octane `createRoot`/`hydrateRoot` + `flushSync` + a bounded render⇄passive-effect settle loop (the sync-`act` equivalent) |
| `fireEvent` remappings (mouseEnter→mouseover, focus→focusin, change semantics, …) | compensate for React's synthetic event plugins | **intentionally dropped** — octane handlers receive the native events; remapping would be wrong |
| act-compat / `IS_REACT_ACT_ENVIRONMENT` | toggled around `waitFor` via DTL's `asyncWrapper` | `setIsOctaneActEnvironment` mirrored in `src/act-environment.ts`, suspended in `asyncWrapper` |
| StrictMode / `legacyRoot` / root error-option plumbing | React-only | not ported (no octane equivalent, by design) |

Octane-specific API surface (documented in the package README): components are
values in plain-`.ts` tests, so `render(App, {props})` is supported alongside
`render(createElement(App, props))`; `rerender(App, props)` takes bare props.

## 2. Hook slots in `renderHook`

Octane hooks are keyed by compiler-assigned call-site slots, and a plain-`.ts`
harness is outside the compiler:

- the harness component's own hooks use **explicit `Symbol.for` slots**, and the
  package **declares `"octane": { "hookSlots": { "manual": ["src"] } }` in its package.json**
  so the auto-slotting pass skips those sources in workspace links and installed
  raw packages alike; other installed Octane sources remain transformable;
- the user's hook callback is invoked through **`withSlot`**, so a slotless
  binding hook (`renderHook(() => useStore(api))`) resolves an identity via the
  path stack; callbacks the compiler did slot fold their explicit slots into the
  path deterministically;
- limitation (README): an **uncompiled** callback calling 2+ base hooks directly
  needs explicit symbols — the path alone cannot distinguish them.

## 3. Test slice ported (packages/testing-library/tests/)

- `render.test.ts` — render.js:28/73/78/93/149/163, multi-base.js:18,
  rerender.js:20/50, act.js:4; plus the octane `(Component, {props})` form and
  the pinned host-descriptor comment-anchor divergence.
- `cleanup.test.ts` — cleanup.js:4/25/30 + auto-cleanup.js (global-`afterEach`
  registration exercised via `vi.resetModules()` with a stubbed hook).
- `events.test.ts` — events.js:154/207/216, act.js:20; pins the native
  `input`/`change` split (no synthetic onChange remap — still true after the
  2026-07-08 controlled-components reversal: `value`/`checked` are controlled
  per React, but events stay native).
- `renderHook.test.ts` — renderHook.js:10/24/53 + act-wrapped updates,
  cleanup-on-unmount, cross-harness state isolation.
- `act.test.ts` — act.js:14 + error propagation.
- `async.test.ts` — end-to-end.js:55/62/69 (`waitForElementToBeRemoved`,
  `waitFor`, `findBy*`) + a `use(promise)`/Suspense reveal via `findByTestId`.

## 4. Known gaps / deferred

- **No exported scheduler-quiescence probe.** `runtime.ts`'s `hasPendingWork`
  is private, so the sync settle after render/fireEvent is a bounded
  drain-and-flush loop (20 rounds; O(1) per round once idle) instead of an
  exact check. A tier-3 `isSchedulerQuiescent()` (or a sync `act`) would make
  it exact. Runtime change — maintainer's call.
- **Fake-timer `waitFor` settle.** RTL's `asyncWrapper` advances jest's global
  fake clock by 0ms before restoring the act environment; vitest exposes no
  global handle, so under detected fake timers we settle on a drained microtask
  queue instead (octane flushes on microtasks, so committed work is already
  visible). Real-timer `waitFor`/`findBy*` are tested; a fake-timer test slice
  is deferred.
- **`hydrate: true`** is a thin passthrough to `hydrateRoot` and is untested
  here (octane's own `tests/hydration/` covers adoption; an RTL-level test
  needs the server-compile rig).
- **Typed custom queries.** The `queries` render-option is honored at runtime
  but the result type is fixed to the default query set (RTL threads a `Q`
  generic through everything; add if demand appears).
- `@testing-library/user-event` compatibility is untried — likely mostly-works
  (it drives real event sequences) and worth a follow-up test slice.
