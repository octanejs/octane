---
"octane": patch
---

Error boundaries no longer corrupt the DOM when a @catch arm rethrows mid-render: the rethrown error now unwinds the live render stack before the outer boundary switches arms (previously the outer switch swept insertion anchors out from under still-mounting frames, producing an insertBefore NotFoundError that replaced the original error and could blank the page). During hydration, a client-built @catch arm also discards the slot's leftover server DOM, parks the adoption cursor past the slot, and renders with adoption suspended, so sibling content keeps hydrating cleanly instead of mis-adopting.
