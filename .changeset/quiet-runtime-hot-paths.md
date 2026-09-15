---
'octane': patch
---

Reduce repeated runtime work on the client and server. Empty descriptor hosts skip
child-list scratch arrays, passive-effect batches reuse their scheduling callback,
and identical server styles reuse their records and replay snapshots.
