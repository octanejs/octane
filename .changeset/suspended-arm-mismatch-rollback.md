---
'octane': patch
---

Keep a resolved Suspense arm's server content in place while its first hydrating attempt is suspended, even when that attempt had to rebuild a mismatched node. The discarded attempt no longer removes server nodes or leaves client-built ones behind, and the attempt that commits reports the structural mismatch, and calls `onRecoverableError`, once.
