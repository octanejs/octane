---
'octane': minor
---

Octane Data: a read's `tags` and a write's `invalidates` can be computed from the input, such as ``tags: (id) => [`project:${id}`]``, so an invalidation reaches only the reads for that input. Static lists work as before.
