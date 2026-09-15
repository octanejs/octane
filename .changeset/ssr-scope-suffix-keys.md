---
'octane': patch
---

Key SSR scoped child-segment and occurrence counters by the frame-relative scope suffix instead of the full `ASYNC_SCOPE` path. Every component child re-scanned the shared path prefix during counter lookup, so SSR render cost grew with tree depth — measured ~53% faster on an arm-heavy SSR workload and ~16% faster on a plain nested-component tree, with byte-identical rendered output. Async identity, arm segment numbering, `use()` occurrence keys, replay, streaming, and hydration seed behavior are unchanged.
