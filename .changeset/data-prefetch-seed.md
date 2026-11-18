---
'octane': patch
---

`store.prefetch` no longer reloads, for its age, a value no reader has shown yet, as a first reader already did not. A route that prefetches its reads now hydrates from the server's seed without loading them again, and a prefetch after a hover prefetch no longer loads twice.
