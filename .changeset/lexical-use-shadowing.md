---
'octane': patch
---

Preserve ordinary calls to locally bound functions named `use`. These calls keep their JavaScript argument order and no longer introduce a conflicting server runtime import.
