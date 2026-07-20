---
'octane': patch
'@octanejs/vite-plugin': patch
'@octanejs/mcp-server': patch
'@octanejs/devtools': patch
---

Octane DevTools: a new `octane/devtools` runtime bridge
(`globalThis.__OCTANE_DEVTOOLS__` — live component tree walking, per-hook
state inspection with compiler source positions, commit/effect/HMR events,
root registry) gated behind the reserved `__OCTANE_DEVTOOLS_ENABLED__`
constant so normal and production bundles compile it away byte-identically;
a new `@octanejs/devtools` package with the in-page panel (component tree,
live props/hook state, profiler-backed performance, event timeline,
settings) plus bounded value serialization, snapshot assembly, and
copy-paste agent prompt generation with exact `file:line:column` evidence;
a `devtools: true` opt-in on the Vite integrations (serve-mode only) that
injects the panel and exposes `GET /__octane_devtools/snapshot`; and an
`octane_devtools_snapshot` MCP tool that lets agents read the running
app's tree, state, and performance directly from the dev server.
`useDebugValue` is live in devtools builds — recorded per call-site slot
with its owning custom hook and source position, `format` applied only at
inspect time — and the panel exposes a plugin API
(`registerDevtoolsPanelPlugin`) so bindings can contribute their own tabs.
The Rspack/Rsbuild integrations pin the reserved devtools constant so
their production bundles keep erasing every instrumentation branch.
The dev-server wiring ships as a standalone `@octanejs/devtools/vite`
plugin (`octaneDevtools()`, serve-only) for compiler-only apps;
`@octanejs/vite-plugin`'s `devtools: true` composes it automatically.
