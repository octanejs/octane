---
'octane': minor
---

`getPhase()` now reports the phase of a commit as well as of the layout queue: `RenderingPhase.WRITE` while a commit applies its DOM mutations, refs and layout effects and while a root unmounts, `RenderingPhase.READ` during a `useLayoutSnapshot` measurement, and `RenderingPhase.IDLE` in renders, passive effects and event handlers. `flushSync` called from a `readLayout` task no longer commits between the queued reads; its updates commit right after the queue has run.
