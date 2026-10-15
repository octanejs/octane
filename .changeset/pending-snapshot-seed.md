---
'octane': patch
---

A server render that reads a pending or failed query through `snapshot()` no
longer throws "A completed native server read has no serializable ready value"
once the server has loaded a module that reads signals. The snapshot renders
the state as it is and adds nothing to the hydration snapshot, rather than an
invented ready value: the client resolves that state itself, or takes the
result a stream delivers, as it does when no module reads signals. A completed
`get()` of a value that is not ready still throws.
