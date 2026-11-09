---
'octane': patch
---

Accept an asynchronous state update guarded by `!signal.aborted` in Strong mode when `AbortSignal.any([...])` includes a signal whose controller the effect cleanup aborts.
