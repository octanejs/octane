---
'octane': patch
---

Keep existing context consumers reactive when their retained ancestor becomes a
memoized component or compiler-cached child boundary. Preserve DOM identity and
context subscriptions across suspended updates.
