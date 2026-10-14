---
'octane': patch
---

Hydrating a Suspense boundary, a `@try` or an `ErrorBoundary` no longer inserts
comment nodes into the server's HTML: the boundary's content keeps the server's
range. A fallback that later shows beside that content adds one comment with
its own nodes, when it commits.
