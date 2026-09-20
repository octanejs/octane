---
'octane': patch
---

Keep scalar binding caches coherent when hydration retains an early DOM binding's publication, so the next normal render can restore historical props after the early binding is released.
