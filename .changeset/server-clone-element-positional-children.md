---
'octane': patch
---

Resume server signals below `cloneElement` children during hydration.

The server's `cloneElement` did not mark two or more positional children as
fixed siblings, as the client's does. Components inside a nested array or
Fragment among those children got a different signal identity on each side,
so hydration refetched a server-resolved `query$` and reported a mismatch.
