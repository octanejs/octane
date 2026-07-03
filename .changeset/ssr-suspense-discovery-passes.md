---
"octane": patch
---

SSR Suspense: collapse the per-pass full-tree re-render for waterfalls.

`render()` used to re-render the WHOLE tree once per suspense pass, so a D-level
`use(thenable)` waterfall cost D+1 full-tree serializations — O(tree × D), which
re-serialized all the static page bulk on every pass. It now records a discovery
job for the innermost suspending COMPONENT and re-renders only that subtree
between the (few) canonical full passes, so a deep waterfall costs ~2 full passes
plus D cheap subtree re-runs. The emitted HTML, `<head>`, scoped CSS, hydration
markers, and suspense seed order all still come from a single normal full pass, so
output and hydration are byte-identical; `use()` keys are now scoped to the
enclosing component frame (internal only — the client still seeds by cursor). The
no-suspense fast path is unchanged. On the SSR throughput waterfall bench the D=4
render dropped from ~0.104ms to ~0.049ms (depth-4-vs-1 scaling 2.6x → 1.15x), and
32-in-flight concurrent throughput roughly doubled, while a shallow (D=1) render
and no-suspense pages are unchanged. Deep waterfalls also stop re-firing shallow
`use(fetch(...))` thenable creators on every pass.
