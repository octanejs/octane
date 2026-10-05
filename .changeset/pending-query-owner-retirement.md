---
'octane': patch
---

Abort a pending `query$` request when its owner is replaced or removed while a
Suspense boundary or `@try` is still pending.

Before, a retried attempt kept the old owner's request alive until the boundary
resolved. This happened when a child under a pending boundary changed only its
`key`, when an `@if` arm or component was swapped, or when a nested boundary
was removed while its outer boundary waited. A newer attempt that renders a
different component, key or arm in that place, or completes without it, now
retires the old owner and aborts its request. A place that attempt has not
reached yet keeps its request, and so does an owner that renders again with the
same identity.
