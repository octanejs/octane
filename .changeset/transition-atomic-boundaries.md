---
'octane': patch
---

Hold a Suspense boundary whole through a transition.

A transition that suspended used to leave part of the new screen on top of the
old one. Rendering and mutating happen in one walk, so a component patched its
own attributes and text on the way down and only afterwards found that a child
below it was still loading — the boundary kept its old content but the markup
around it had already moved on. The same thing happened when a held boundary
replayed its body and only some of the data had arrived: the resolved parts
committed and the rest stayed behind.

A suspended attempt now undoes its own binding writes, so the boundary either
updates completely or not at all. The undo runs in the same flush as the change,
so nothing intermediate is ever painted and transitions stay monotonic — no
visible rollback, no invalid intermediate structure.

`benchmarks/async-composition` records zero exposed intermediate states for a
transition update, level with React, with its ceiling tightened from one to zero.

Controlled `value`, `checked` and `selected` are held too, along with their
`default*` mirrors and the record of what was last projected.

Two things a transition can still change early: content it patched outside a
suspended boundary, and a structural change above one such as a keyed list
reordering.
