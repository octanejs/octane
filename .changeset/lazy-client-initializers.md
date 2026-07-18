---
'octane': patch
---

Make client imports tree-shakeable and defer browser setup until the relevant
feature is first used. Compiled DOM templates now parse on first mount,
post-paint scheduling creates its channel on demand, and unused generated
component initializers can be removed. Add `initializeHydrationEventCapture()`
for applications that await work before `hydrateRoot()` so deferred interaction
intent remains replayable without import-time listeners.
