---
'octane': patch
---

Shrink compiled commit functions: the runtime now clears a bag's staged state and passes its cells, `bagDone` no longer takes the commit function, `sibling()` omits its default step, and byte-identical commit functions in one module share a declaration.
