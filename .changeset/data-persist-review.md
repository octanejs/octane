---
'octane': patch
---

`octane/data`'s persistent cache fixes two gaps. A saved value that a write or `invalidate()` marks stale is now restored stale, even when no read loaded it in that session, so a restart within its freshness no longer shows data from before the write. Purging at startup now removes only expired values. The size budget is applied at the first save, once the store knows which values mounted components are restoring.
