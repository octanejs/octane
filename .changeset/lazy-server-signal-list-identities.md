---
'octane': patch
---

Defer server-side signal identity serialization until an actual handle is read. Ordinary object-keyed lists no longer coerce reconciliation keys merely because opaque output might contain a handle. Actual handles retain the same nested-list and component-key identities across SSR, hydration and reordering.
