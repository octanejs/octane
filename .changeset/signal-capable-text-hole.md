---
'octane': patch
---

Update a signal-capable text hole with one text write.

When a module renders signal-capable bindings, its later identifier holes
compile to `bindSignalChild`. For a plain primitive in an ordinary
marker-bounded hole, that binding reached the general `childSlot` path on every
render. It now keeps `textHoleUpdate`'s fast path: an unchanged primitive does
nothing, and a changed one rewrites the slot's Text node. Signal handles,
elements, raw-HTML hosts, and mode switches still take the general path.
