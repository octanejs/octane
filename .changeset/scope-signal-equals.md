---
'octane': minor
---

Add an `equals` option to `scope.signal$` and `scope.derived$` from `octane/signals`. When `equals(previous, next)` finds a write or a recomputed result equal, the signal keeps the previous value by reference and nothing downstream recomputes or is notified. `Object.is` remains the default.
