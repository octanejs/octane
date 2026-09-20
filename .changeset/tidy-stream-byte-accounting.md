---
'octane': patch
---

Avoid allocating temporary UTF-8 buffers when checking streamed signal injection byte limits on Node hosts. Preserve the same frame bytes, limits, ordering, and backpressure, with unchanged TextEncoder accounting on hosts without Buffer.
