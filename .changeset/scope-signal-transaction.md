---
'octane': minor
---

Add `scope.transaction(fn)`, a batch that restores every signal it changed when `fn` throws, before any subscriber sees the failed writes, and otherwise returns the coalesced changes with `undo()` and `redo()`.
