---
'octane': patch
---

A `'use dom bindings'` view no longer writes the page while an Octane render is
running. When render code publishes to a binding's source or calls its
`refresh()`, the binding writes once that render returns, whether the root
commits it or drops it, so the next paint shows the new value as before.
Outside a render, notifications and `refresh()` still write synchronously.
