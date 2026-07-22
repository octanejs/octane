---
'octane': patch
---

Emit exact `split={false}` / `never()` hydration boundaries as wrapper-free
server-only ranges, prune private module-scope descendants used exclusively by
those ranges, and defer boundary activation until nested renderer-owned Suspense
reveals settle.
