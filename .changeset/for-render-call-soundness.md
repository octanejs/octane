---
'octane': patch
---

Keyed `@for` correctness: a render-time call in the item body (e.g. `header.column.getIsSorted()` on a memoized TanStack Table header) now disqualifies the PURE/DEP-PURE survivor short-circuit, so the body re-runs on every parent render like React. Calls can read mutable state that neither the item reference nor the deps tuple witnesses — previously a ref-stable survivor could render stale output. Property-read-only bodies (the measured benchmark wins) keep the promotion; calls deferred inside event-handler closures stay eligible.
