---
'octane': patch
---

Re-export `__methodDep` from `octane/universal` and `octane/universal/native` so compiler-emitted method-call dependency imports resolve on universal targets. Universal builds previously failed at module resolution while the default entry compiled fine.
