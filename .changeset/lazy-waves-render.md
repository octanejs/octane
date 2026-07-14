---
'octane': patch
---

Reduce server-rendered `@for` overhead by accumulating item HTML directly, omitting per-item hydration markers for proven direct-host rows, and skipping keyed async-identity bookkeeping for compiler-proven synchronous items.
