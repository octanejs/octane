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

Content the same transition patches outside a suspended boundary still updates
early — that is what keeps `useTransition`'s `isPending` cue responsive — and
structural changes such as a keyed list reordering above the boundary are not
covered.
