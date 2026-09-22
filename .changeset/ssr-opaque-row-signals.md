---
'octane': patch
---

Keep component-local SSR signals independent for distinct object, function, and symbol list keys, without coercing opaque reconciliation keys. Preserve their identity through retries, hydration, and row reordering.
