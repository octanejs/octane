---
'octane': patch
---

Pass a `@catch` arm the same `reset` function on every render, as an
`ErrorBoundary` fallback already receives. Production builds of `octane/behavior`
now throw coded errors that link to the error decoder, like the rest of the
runtime, and the client runtime ships one copy of several shared predicates.
