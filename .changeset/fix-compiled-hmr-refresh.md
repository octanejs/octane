---
'octane': patch
---

Refresh compiled component output correctly after accepted hot updates.

Hot refresh now discards the outgoing compiler-owned template and slot layout before mounting the
new body, while retaining the component block and its hook state. Exclusively owned markerless
output is promoted to a durable component range during refresh, so static markup edits and newly
added component calls update immediately in both mounted and hydrated applications instead of
leaving stale DOM or throwing during insertion. When an enclosing control-flow branch shares that
root as its boundary, the update safely falls back to a page reload instead.
