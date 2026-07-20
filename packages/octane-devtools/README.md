# @octanejs/devtools

In-page developer tools for the [octane](https://octanejs.dev) UI framework.

The panel renders the live component tree with props and per-hook state (call
order, kinds, source positions), profiler-backed render performance (counts,
causes, self/inclusive time, boot timings), a runtime event timeline, and
feature toggles — plus one-click **agent prompts**: any selected component or
performance finding exports a ready-to-paste markdown prompt with exact
`file:line:column` positions, live state, and render evidence for a coding
agent. The panel is itself an Octane app, rendered in an isolated shadow-DOM
root and excluded from its own instrumentation.

## Enable

Devtools is off by default. Opt in on the Vite integration; it activates only
for the dev server, and every build compiles the bridge, metadata, and panel
away:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { octane } from '@octanejs/vite-plugin';

export default defineConfig({
	plugins: [octane({ devtools: true })],
});
```

The plugin injects the panel automatically. The dev server also exposes
`GET /__octane_devtools/snapshot` — the live tree/state/performance document
consumed by `@octanejs/mcp-server`'s `octane_devtools_snapshot` tool, so
agents can inspect the running app directly.

Compiler-only apps (no metaframework) compose the standalone plugin from
this package instead:

```ts
import { octane } from 'octane/compiler/vite';
import { octaneDevtools } from '@octanejs/devtools/vite';

export default defineConfig({
	plugins: [octane({ devtools: true }), octaneDevtools()],
});
```

Apps that don't use the metaframework plugin can mount the panel manually
from a dev-only entry (the bridge still requires a devtools-enabled compile
via `octane/compiler/vite`'s `devtools` option):

```ts
import { mountDevtoolsPanel } from '@octanejs/devtools';

mountDevtoolsPanel();
```

## Programmatic API

- `getDevtoolsHook()` / `waitForDevtoolsHook()` — the live
  `globalThis.__OCTANE_DEVTOOLS__` bridge (tree walking, inspection, events).
- `registerDevtoolsPanelPlugin({ id, label, component })` — add your own tab
  to the panel; the Octane component receives the live bridge as `hook`.
  `useDebugValue` in custom hooks surfaces in the inspector automatically
  (with the React contract: `format` runs only when inspected).
- `buildSnapshot(hook, options)` — one inert JSON document of tree + state +
  profiler summary + recent events.
- `buildAgentPrompt(snapshot, { kind, nodeId, issue })` — the markdown prompt
  the panel's copy buttons produce.
- `serializeValue` / `formatValuePreview` — the bounded, cycle-safe value
  serializer used everywhere above.

## Performance

Normal and production builds contain none of this — the runtime's
instrumentation sites compile away behind `__OCTANE_DEVTOOLS_ENABLED__`
(verified byte-identical in the test suite). With devtools enabled, steady
overhead is one event per commit; per-effect timing is off until the panel's
timeline explicitly enables it, and tree walks run only when the panel (or a
snapshot request) asks.
