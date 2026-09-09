---
'octane': patch
---

Avoid constructing a native event path during the capture observer when a single root has no portals, and reuse the path across the capture and emulated bubble queues of nonbubbling events.
