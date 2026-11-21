---
'octane': patch
---

Pass the elements of render-only `@if` arms and `@for` rows to a `descriptorChildren` component, so `Children.toArray` and child walks see them as they see `{cond && <X />}` and `.map()`, instead of one opaque compiled fragment.
