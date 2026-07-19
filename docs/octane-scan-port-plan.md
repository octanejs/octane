# react-scan → Octane port (`@octanejs/scan`)

A port of **`react-scan`** (github.com/aidenybai/react-scan) for the Octane
renderer: automatic render detection, on-screen outline highlighting, a
toolbar with a component inspector, and a programmatic render-report API.
Upstream pin: **`react-scan@0.5.7`** (latest published at adoption,
2026-07-19; commit recorded when the source snapshot is vendored in Phase 3).

## Why this is NOT a normal binding

Every existing `@octanejs/*` binding sits on a React library's public API and
swaps the React-facing layer for Octane hooks. react-scan is different in kind:
its core does not consume React's public API at all. It instruments React's
**internal fiber tree** (via `bippy`, hooking the DevTools global
`onCommitFiberRoot`) to observe every commit, walk changed fibers, read
`fiber.alternate` to diff props, and map fibers to host DOM nodes for outline
drawing.

Octane has none of those internals: no fibers, no alternate tree, no DevTools
commit hook, and compiled components whose DOM is tracked as block ranges.
Dominic's assessment ("likely will require far more intervention as we diverge
from React quite a bit") lands exactly here: **the fiber-instrumentation core
cannot be ported — it must be replaced by first-class Octane runtime
instrumentation**, some of which does not exist yet and must land in
`packages/octane` first.

The good news: Octane already ships most of the observation layer react-scan
has to reverse-engineer out of React. `octane/profiling` (compiled in when
`octane({ profile: true })`, tree-shaken otherwise via
`__OCTANE_PROFILE_ENABLED__`) records per-render `ProfileEvent`s with
component identity (name/file/line via compile-time metadata), mount/update
phase, `bailout` outcomes, **causes** (which hook slot scheduled the render,
with source attribution — richer than react-scan's prop-diff guesses),
timings, and queue delay. `profiler.why()` already answers "why did this
render" as data. What profiling deliberately does NOT expose (by design:
"identities and timings, never live props, state, … DOM nodes") is exactly
what a scanner overlay needs:

| react-scan needs               | Octane today                            | Gap |
| ------------------------------ | --------------------------------------- | --- |
| commit-batch boundaries        | flush exists, no observable hook        | new |
| live event stream              | `profiler.getEvents()` ring buffer only | new subscriber API |
| component → host DOM rects     | block ranges are runtime-private        | new |
| props-diff ("unnecessary")     | causes cover state/context/props source | partial: needs equal-but-new-reference classification |
| works with zero config in dev  | profiling is opt-in even in dev         | decision needed |

## Architecture

```
packages/octane (Phase 1 — the "intervention")
  runtime.ts + profiling.ts: dev/profile-gated inspection channel
    - subscribe(listener): live ProfileEvent stream + commit boundaries
    - domRangeFor(instanceId): component instance → live DOM nodes/rects
    - render classification: props changed / equal-but-new-reference / state / context

packages/scan (@octanejs/scan)
  src/core/      adapter: Octane inspection events → scan render model,
                 aggregation, report store, options store (framework-free TS)
  src/outlines/  outline canvas renderer — ported from upstream mostly
                 verbatim (it is already framework-agnostic canvas code)
  src/toolbar.ts toolbar in plain DOM inside an isolated shadow root.
                 Upstream deliberately renders its UI in Preact — NOT React —
                 so the tool never instruments itself; the faithful port of
                 that rationale is DOM, not Octane components (an
                 Octane-rendered toolbar would profile-instrument its own
                 re-renders and feed back into the overlay)
  src/index.ts   scan(), useScan(), setOptions(), getOptions(), getReport(),
                 onRender() — upstream API shape
  src/auto.ts    side-effectful auto-start entry (script-tag equivalent)
```

## API parity and intentional divergences

Ported 1:1 where the concept survives; divergences are documented and tested
as Octane contracts (`// OCTANE DIVERGENCE:`), per repo policy:

- `scan(options)`, `useScan(options)`, `setOptions`, `getOptions`,
  `getReport`, `onRender(Component, cb)` — same names and shapes.
- Options: `enabled`, `log`, `showToolbar`, `animationSpeed`,
  `trackUnnecessaryRenders`, `onCommitStart`, `onCommitFinish`, `onRender`.
- **DIVERGENCE — no fibers:** upstream callbacks receive `Fiber` objects; ours
  receive an `OctaneRenderInfo` (component metadata, instance id, phase,
  causes, timings, DOM rect handle). There is nothing to fake a Fiber from,
  and pretending would break every consumer assumption anyway.
- **DIVERGENCE — enablement:** react-scan advertises "no code changes";
  Octane's production compile strips profiling entirely, and even dev compile
  gates it behind `octane({ profile: true })`. Decision recorded in Phase 0/1:
  either (a) `@octanejs/scan` requires `profile: true` (document loudly), or
  (b) Phase 1 also emits the inspection channel in plain dev serve builds
  (preferred: dev builds already carry LOC metadata; keep prod stripped).
  `dangerouslyForceRunInProduction` maps to "app must be profile-compiled" —
  a build-time property, not a runtime flag; documented as such.
- **Out of scope (initial):** `react-scan/monitoring` (the hosted telemetry
  product), the browser extension, and the `react-scan` CLI. The `auto.global.js`
  script-tag entry needs a prebuilt IIFE bundle, which conflicts with the
  raw-source binding standard — deferred to Phase 5 with an octane-core-style
  `prepack` build if wanted.

## Phases

**Phase 0 — pin + scope.** Vendor-pin upstream (tag/commit in this doc),
inventory upstream entry points and Options fields against the current
release, land this plan. Exit: plan reviewed, enablement decision made.

**Phase 1 — core runtime intervention (`packages/octane`).** The inspection
channel: a dev/profile-gated subscriber API over the existing profiler
(live events + `commit-start`/`commit-finish` markers aligned with flush
boundaries), instance→DOM-range resolution, and render classification
(`props-new-reference-equal` for `trackUnnecessaryRenders`). Behavioral tests
in `packages/octane/tests/` (octane + octane-prod projects: prod compile must
tree-shake to nothing). Changeset (`octane`, patch). Exit: a test can
subscribe, render a fixture, and receive events with resolvable DOM rects.

**Phase 2 — scan core (`packages/scan`).** Package scaffold to binding
standard (checklist below). Adapter + aggregation + report/options stores +
`scan()`/`setOptions`/`getOptions`/`getReport`/`onRender`/`log`. No UI yet.
Exit: unit + jsdom tests prove report parity semantics on fixtures.

**Phase 3 — outlines.** Port upstream's canvas outline renderer (labels,
batching, fade, `animationSpeed`) onto Phase-1 rects. Real-browser test
project (playwright, following `octane-events-browser`): render, interact,
assert canvas activity/outline geometry. Exit: visible highlighting in the
playground app.

**Phase 4 — toolbar + inspector.** Octane-component toolbar in a shadow-root
island: enable/pause, animation speed, component inspector (props/state via
dev inspection, "why did this render" from ProfileCause), render counts/FPS.
Exit: browser tests for toggle behavior + inspector content.

**Phase 5 — distribution + polish.** `useScan`, `auto` entry decision,
README (install: vite plugin `profile: true` + `scan()` in entry), docs.

**Phase 6 — repo integration.** `status.json` + `pnpm bindings:status`,
website `bindings.json` ("Styling, tests, and devtools"), root `typecheck`
entry + package `tsconfig.json`, pack-canary coverage if the package gains a
build step, changeset. Exit: all repo checks green.

## Package standards checklist (the "all standard rules")

- `packages/scan/package.json`: name `@octanejs/scan`, `type: module`,
  `main/module/types: src/index.ts`, `exports` per entry, `files: [src,
  README.md]` (raw-source publish — no build step unless Phase 5 adds the
  global bundle), `peerDependencies: { octane: workspace:* }` (this is also
  the compiler's `usesOctane` opt-in), `octane: { hookSlots: { manual:
  ["src"] } }` for the hand-forwarded `useScan` slot, `publishConfig.access:
  public`, catalog versions for shared devDeps.
- `status.json` (upstream pkg+version, surface, divergences, ssr, verified) —
  SSR note: scanner is client-only; `scan()` must no-op cleanly under SSR.
- `tests/` runnable with zero `skip`/`todo`; browser evidence in a dedicated
  playwright project; divergences asserted as passing `// OCTANE DIVERGENCE:`
  tests.
- README with the honest enablement story; changesets on `octane` (Phase 1)
  and `@octanejs/scan` (first publish), both patch-track.

## Testing strategy

No differential rig: upstream's observable output is visual overlay +
console + report objects tied to fiber identities, so byte-equal HTML
comparison does not apply. Instead: (1) unit tests for aggregation/options
stores against synthetic inspection events; (2) jsdom behavioral tests for
API surface and report semantics; (3) real-browser tests for outlines and
toolbar; (4) core Phase-1 tests live with the runtime and also run under the
prod-compile project to prove zero production footprint; (5) a fixture-level
sanity check that render counts a scan report attributes match
`profiler.summary()` for the same interaction.

## Fidelity pass (2026-07-19)

The outline overlay and toolbar were re-ported directly against upstream source
(`react-scan@0.5.7` `src/new-outlines/canvas.ts` and `src/web/views/toolbar`)
for visual/behavioral parity rather than an approximation:

- **Outlines** now use react-scan's exact draw routine: indigo
  `rgb(115,97,230)`, 1px stroke snapped to the pixel grid (`round+0.5`) with a
  10%-alpha interior fill, a 45-frame linear fade (`α = 1 − frame/45`, reset on
  re-render), `lerp` easing (0.2 factor, 0.5px snap) toward each freshly
  measured rect, and `getLabelText` grouping (`A, B ×N`, ≤4 names, 40-char
  truncation, `×` = U+00D7). `animationSpeed` stays meaningful: `off` skips
  drawing, `slow` doubles the frame life, `fast` matches upstream.
- **Toolbar** now mirrors react-scan's bar exactly: black bar, an inspect
  toggle (crosshair/focus icons, `#999`→`#8e61e3`), the "Outline Re-renders"
  pill power switch (`#5f3f9a` on / `#404040` off) driving `enabled`, and a
  color-graded FPS meter (`#ef4444` <30, `#f59e0b` <50, `rgb(214,132,245)`
  otherwise), on a `#141414` chip. FPS is ported 1:1 from react-scan's
  frame-count loop — it observes browser paint cadence, nothing React-specific.
  The upstream animation-speed control does not live in the bar, so it was
  dropped from ours too; `animationSpeed` remains a programmatic option.

## Interaction inspector (2026-07-19)

Ported react-scan's `core/notifications` engine and its toolbar notifications
panel (confirmed 100% client-side — even Prompts/Alerts are local). On each
click/keydown an interaction is timed through the detailed-timing state machine
(microtask → animation frame → timeout, upstream's fallback path since Octane
produces commit timing directly), the components that rendered during the
window are aggregated from the core's render sink, and the result is recorded as
a bounded History. The bell expands the bar into the panel: a
`Clicked X — Nms processing time` header (green/amber/red severity by the
<200/<500 thresholds), the History column, and Ranked (self-time bars) /
Overview (stat breakdown) / Prompts (a copyable optimization prompt) tabs plus
an Alerts audio-chime toggle. Palette matches upstream (`#000`/`#0A0A0A` shell,
`#7521C8` active tab, `#8E61E3` active icon, `#18181B` elevated, severity
`green-500/50`/`#b77116`/`#b94040`).

## Naming resolution (2026-07-19)

The "Unknown" epidemic on hydrated pages is resolved without a runtime change.
Root cause: instances only register while the profiler is `active`, and scanning
was toggled on from an effect *after* hydration, so the initial mounts were
never recorded and clicks resolved to nobody. Fix, entirely in `@octanejs/scan`
over the existing public profiler API:

- `index.ts` calls `profiler.start()` at import — before the app hydrates — so
  every hydration mount registers an instance (in an unprofiled build the
  profiler is a stripped no-op, so this is inert).
- A shared `registry.ts` resolves an element to the innermost profiled instance
  whose `domNodes()` contains it, fed live from the core's render sink and, once,
  lazily seeded from `profiler.getEvents()` — the backfill that names instances
  which mounted before the sink was listening. The inspector and interaction
  profiler both route through it. `registry.test.tsrx` proves a component that
  mounted before any sink was attached is still resolved; the browser suite
  asserts a real click resolves to a component name, not `Unknown`.

The `enabled`/pause option keeps its documented meaning (detach the core's
report/outline stream); the profiler stays active for indexing regardless.

## Known follow-ups

- **Precise lite-scope DOM ranges.** `profiler.domNodes()` resolves lite
  (hookless) components through the whole-container fallback — the host
  element's children — because the runtime does not track a range start for
  lite scopes. Outlines merely over-flash; the inspector's innermost-match
  can mis-attribute a host's direct child to a lite sibling (asserted
  loosely in inspector tests). Fix in `packages/octane`: profile builds
  record the planted range for lite scopes so resolution is exact.
- **Inspector props/state viewing.** v1 shows identity, report counts, and
  schedule causes only; live props/state need a new runtime introspection
  surface and its own privacy discussion.

## Open questions (resolve in Phase 0 review)

1. Enablement default: require `profile: true`, or emit the inspection
   channel in all dev serve builds (preferred)?
2. Does `onRender(Component, cb)` accept the compiled component function
   (works via existing component-metadata WeakMap) — any HMR-wrapper
   identity concerns?
3. Package/npm naming: `@octanejs/scan` (matches binding convention) vs
   `octane-scan` (matches upstream branding); this plan assumes
   `@octanejs/scan`.
4. Outline renderer reuse: vendor upstream files verbatim with a thin rect
   provider interface (easier upstream tracking), or re-implement?
