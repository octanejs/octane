---
'octane': patch
---

Skip already-drained scheduled flushes after synchronous native-event commits. Preserve commit-only effects, refs, Fragment bindings, transition finalization, profiling notifications, and microtask ordering.
