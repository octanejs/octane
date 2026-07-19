---
'@octanejs/scan': patch
---

Port react-scan's toolbar notifications panel — the interaction inspector. The
collapsed bar gains a notifications bell that expands the black shell into a
panel with a "Clicked X — Nms processing time" header (severity-colored), a
History column of past interactions, and Ranked / Overview / Prompts tabs plus
an Alerts audio-chime toggle. Under it, a client-side interaction profiler
(ported from react-scan's `core/notifications` detailed-timing pipeline) times
each click/keypress, names the component under the pointer, and aggregates the
components that rendered during the interaction — all local, no backend. The
component name resolves once a target has rendered under the active scan, so
interactions that cause a render are named and statically hydrated targets read
`Unknown` until a runtime element→component resolver lands.
