---
'octane': patch
---

A DOM binding program, such as an island view, no longer ends silently on any error named `ScopeDisposedError`. It ends quietly and keeps its last DOM only when the owner of a source it observes retires. Observed sources are a tracked `.get()` read, a bound signal handle (concrete, declared, optimistic, or accepted by a transition), a whole-style or projected binding, and a bound control. A read of a different, already retired scope, or any error that only shares the name, is now reported through `reportError`. Like any other failure of a committed program, it keeps the last DOM and later updates still apply.
