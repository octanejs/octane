# @octanejs/scan

[react-scan](https://github.com/aidenybai/react-scan) for the Octane renderer:
automatic render detection and reporting, built on Octane's profile-build
inspection channel instead of React fiber instrumentation.

This is the **programmatic core** (Phase 2 of
[the port plan](../../docs/octane-scan-port-plan.md)). On-screen render
outlines, the toolbar/inspector, `useScan`, and the script-tag auto entry land
in later phases.

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
  plus `showToolbar`/`animationSpeed`/`trackUnnecessaryRenders` accepted for
  parity with react-scan and consumed by the later UI phases.

**Divergence from react-scan:** callbacks receive an `OctaneRenderInfo` — no
fibers exist in Octane. It carries the component's compile-time identity
(name, file, line), phase, **schedule causes** (which hook scheduled the
render, with source location — richer than fiber prop-diffing), timings, and
a pull-based `domNodes()` resolving the instance's current top-level
elements. Under SSR every export is a safe no-op.

See [`status.json`](./status.json) and the
[bindings status table](../../docs/bindings-status.md) for the exact
supported surface.
