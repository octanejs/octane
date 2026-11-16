---
"@octanejs/codemod": patch
---

Emit an empty callback for direct React DOM `flushSync()` and `flushSync(null)` calls so migrated code can drain queued updates on Octane versions that require a callback.
