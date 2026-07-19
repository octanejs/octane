# @octanejs/scan

A [react-scan](https://github.com/aidenybai/react-scan)-style render-inspection
subsystem for Octane — automatic render detection, an outline overlay, a
toolbar, an interaction inspector, and a click-to-inspect panel — built on
Octane's profile-build inspection channel instead of React fiber
instrumentation.

## Architecture

This is a **contract port, not a code port**. react-scan's engine is welded to
React internals (fibers, `fiber.alternate`, `onCommitFiberRoot`). None of that
exists in Octane, so instead of porting the engine, the package is layered so
the engine is swappable and React is just one possible adapter. Dependencies
flow strictly downward; UI never touches the source or the profiler.

```text
InspectionSource (engine adapter)   sources/octane.ts  ← the only octane import
      │  normalized, immutable InspectionEvents
      ▼
Pipeline  (dispatch + per-commit batching)            pipeline.ts
      ▼
Services  (single responsibility each)                services/*
  options · registry · report · interactions · selection · fps
      ▼
Plugins   (first-party + yours)                       plugins/*
  overlay · toolbar · inspector
```

- **Inspection contract** (`contract.ts`) — a framework-agnostic
  `InspectionEvent` (identity, phase, timings, schedule causes, lazy
  `domNodes()`) plus `CommitEvent` and a `SourceCapabilities` flag set.
  Nothing above a source knows whether events came from Octane Blocks, React
  fibers, or Signals.
- **Source adapter** (`sources/octane.ts`) — the only module that imports
  octane internals; it normalizes `octane/profiling` into the contract. A
  React/Preact/Solid adapter would implement the same `InspectionSource`
  interface and everything above it works unchanged.
- **Session** (`session.ts`) — the composition root and lifecycle owner
  (deliberately not a god `core.ts`): it wires source → pipeline → services,
  gates the live feed on `enabled`, and builds the `PluginContext`.
- **Services** — `ComponentRegistry` (element→component + hierarchy),
  `ReportStore`, `InteractionProfiler`, `SelectionService` (inspect state, no
  DOM), `OptionsStore`, `FpsMeter`. Each has one responsibility and depends
  only on the contract/pipeline.
- **Plugins** (`plugin.ts`) — the overlay, toolbar, and inspector are
  first-party plugins consuming public services. A custom plugin (flamegraph,
  heatmap, analytics, AI debugger) registers with `session.use(definePlugin(…))`
  and receives the event/commit/interaction/selection streams — it cannot
  reach the engine or a sibling, so it can never destabilize either.

`scan()`/`useScan()` and friends drive a default session wired to the Octane
source and the three UI plugins; `createSession`, `definePlugin`, the contract
types, and `OctaneInspectionSource` are all exported for hosts that want to
compose their own.

Shipped so far (Phases 2–5 of
[the port plan](../../docs/octane-scan-port-plan.md)): the **programmatic
core**, the **render-outline overlay**, the **toolbar**, the
**click-to-inspect inspector**, and `useScan`. The overlay and toolbar are a
faithful port of react-scan's `new-outlines` and toolbar bar — same indigo
(`rgb(115,97,230)`), 1px crisp stroke plus faint interior fill, 45-frame
linear fade with lerp easing, and `getLabelText` grouping for the outlines;
same black bar with an inspect toggle, a notifications bell, the "Outline
Re-renders" power switch, and a color-graded FPS meter for the toolbar. The
toolbar is **draggable** and snaps to any of the four corners (persisted). The
inspect toggle draws a **hover outline** with the component name over the
element under the cursor, and clicking locks the inspector open. The bell
expands the bar into the **interaction inspector** (react-scan's notifications
panel): each user interaction is timed and named ("Clicked X — Nms processing
time"), listed in a History column, and broken down by the components that
rendered — **Ranked**, **Overview**, and **Prompts** (with **Fix /
Explanation / Data** LLM-prompt sub-tabs) — plus an **Alerts** audio-chime
toggle. All local, no backend. Live props/state viewing and the script-tag
auto entry land later.

**Naming:** components are named through octane's profile-build inspection
channel. Because instances only register while the profiler is active,
`@octanejs/scan` starts the profiler at import — before the app hydrates — so
every mounted component is nameable, not just ones that re-rendered since
scanning was toggled on. (Lite/hookless components over-approximate their DOM
range to the host's children, so a click can attribute to a lite sibling; the
precise-lite-ranges follow-up tightens this.)

## Setup

Unlike react-scan, scanning is a **build property**: Octane's production
compile strips the profiling channel entirely, so the app must compile with
the octane plugin's `profile` option:

```ts
// vite.config.ts
import { octane } from 'octane/compiler/vite';

export default {
	plugins: [octane({ profile: true })],
};
```

Then start scanning anywhere in the client entry:

```ts
import { scan } from '@octanejs/scan';

scan({ log: true });
```

## API

- `scan(options?)` — start (idempotent); enables unless `enabled: false`.
- `setOptions(options)` / `getOptions()` — merge/read the live options.
- `getReport()` — per-component aggregates (`renders`, `bailouts`,
  `totalTime`, `totalSelfTime`, `lastRenderAt`).
- `resetReport()` — drop aggregation.
- `onRender(Component, callback)` — observe one component; returns detach.
- Options: `enabled`, `log`, `onCommitStart`, `onCommitFinish`, `onRender`,
  `showToolbar`, `animationSpeed`, `trackUnnecessaryRenders`.
- `getSession()` — the default `ScanSession`, for adding plugins
  (`session.use(definePlugin(…))`) or reading services directly.

**Divergence from react-scan:** callbacks receive an `InspectionEvent`, not a
`Fiber` — none exist in Octane. It carries the component's compile-time
identity (`{ id, name, file, line, column }`), phase, **schedule causes**
(which hook scheduled the render, with source location — richer than fiber
prop-diffing), timings, and a lazy `domNodes()` resolving the instance's
current top-level elements. Under SSR every export is a safe no-op.

See [`status.json`](./status.json) and the
[bindings status table](../../docs/bindings-status.md) for the exact
supported surface.
