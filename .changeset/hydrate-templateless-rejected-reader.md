---
'octane': patch
---

Hydrate a server-rendered `@catch` arm when a template-less component's `use()` rejected on the server. The component now reads its rejection seed, so the boundary adopts the server's catch arm and reports the caught error instead of discarding that arm, reporting a hydration mismatch, and staying suspended. A component that renders where the server rendered something else still reports the mismatch.
