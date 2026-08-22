---
'octane': patch
---

Retry incomplete descriptor and memoized subtrees before revealing Suspense
content, preserving mounted state and DOM identity. Revisit discarded effect work
after interrupted retries, keep descriptor text and props consistent during held
transitions, and register deferred Activity effects when a cached hidden child
descriptor becomes visible.
