---
'octane': patch
---

Recover from a render that throws a native stack overflow. Signal writes are no longer rejected with `SignalWriteError` afterwards, a parent whose `@try` catches the failure keeps its signal subscriptions, and later updates no longer count as nested inside the failed render.
