---
'octane': patch
---

Batch `useLayoutSnapshot` measurements after synchronous layout updates settle. Snapshots see writes queued by layout effects and publish changed values before paint. Corrective commits remeasure participating snapshots within the existing convergence limit.
