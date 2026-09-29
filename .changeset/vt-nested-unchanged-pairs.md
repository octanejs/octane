---
'octane': patch
---

Keep an unchanged nested `<ViewTransition>` paired when an ancestor boundary animates.

The nested boundary was captured on the old side only, so its old snapshot played the boundary's `update` class on its own, over the ancestor's new snapshot that already paints the same element. It now keeps its name on the new side too, as React does, and cross-fades in place.
