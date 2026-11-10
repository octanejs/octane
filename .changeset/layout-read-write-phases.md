---
'octane': minor
---

Add `readLayout`, `writeLayout`, `flushLayoutSync`, `getPhase` and `RenderingPhase`. `readLayout(task)` and `writeLayout(task)` queue layout reads and DOM writes for the next frame, where every read runs before every write, so components that each measure and then write lay out the page once instead of once per component. Both return a function that cancels the task.
