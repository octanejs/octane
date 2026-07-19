---
'@octanejs/scan': patch
---

Re-architect the package as a layered, multi-engine inspection subsystem rather
than a monolithic port. A framework-agnostic inspection contract
(`InspectionEvent`/`CommitEvent`/`InspectionSource`) sits at the bottom; the
Octane profiler is now one engine adapter (`sources/octane.ts`) behind it, so a
React/Preact/Solid adapter could slot in unchanged. Above the source: a pipeline
(dispatch + commit batching), single-responsibility services (options, registry,
report, interactions, selection, fps), and a plugin layer. The outline overlay,
toolbar, and inspector are now first-party plugins consuming public services;
dependencies flow strictly downward and UI never touches the profiler. New
public surface: `createSession`, `definePlugin`, `getSession`, the contract
types, and `OctaneInspectionSource`. `onRender` callbacks now receive an
`InspectionEvent` (was `OctaneRenderInfo`); read identity via
`event.component.name`. The `scan`/`useScan`/`setOptions`/`getReport` surface is
unchanged.
