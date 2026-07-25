---
'octane': patch
---

Add a dev-only DevTools runtime hook (`globalThis.__OCTANE_DEVTOOLS__`) exposing
the live component tree, per-node state/context inspection, and a per-flush
subscribe channel. It is fully gated behind the profile compile flag, so normal
production builds tree-shake it away.
