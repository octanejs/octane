---
'octane': patch
---

Refresh imported-read projections, `@if` branches and `@for` collections in DOM bindings when an accepted source changes while a newer replacement suspends, instead of leaving the visible UI stale until the replacement settles.
