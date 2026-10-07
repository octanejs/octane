---
'octane': patch
---

Depend on `alien-signals` 3.2.1 so the workspace and `@octanejs/alien-signals`
resolve a single core version. Octane imports only `alien-signals/system`,
which is unchanged from 3.2.0.
