---
'octane': patch
---

Set host refs before layout effects when a nested Suspense boundary reveals
after an update replaced its parent's pending retry. The nested boundary first
suspended inside that retry; once the update discarded it, the boundary stayed
hidden without its reveal bookkeeping, so refs mounted in it (including hosts
preserved from before the suspension) were never attached and a layout effect
reading them saw `null`. A nested boundary that suspends while its parent is
already hidden also no longer calls a callback ref with `null` a second time,
matching React.
