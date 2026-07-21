---
'octane': patch
---

Trim two cold-path costs on hydration/first mount. A keyed `@for`'s first fill
(hydration adoption of the server item ranges, or a fresh mount) now runs
through a small dedicated linear pass (`mountItemsLinear`) instead of entering
the full prefix/suffix/LIS reconciler, so a cold page never pays the big
function's first-call cost just to append items in order; the survivor key map
and sibling chain are still built as a byproduct of the same pass, so update
behavior and the keyed reconciler's guarantees are unchanged. And
`commitEffects` now takes a single no-work fast path when every commit queue is
empty — the common case for a hydration adoption or an effect-free flush —
instead of calling each drain helper to discover there is nothing to do.
