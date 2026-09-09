---
'octane': patch
---

Avoid emitting a parallel `useBatch` for proven module-level context-only reads in TSRX and plain TypeScript. Mixed promise reads and child warming continue to batch as before.
