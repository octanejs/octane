---
'octane': patch
---

Preserve independently managed streamed DOM when it is interleaved with
renderer-owned host children.

The de-optimized host reconciler now adopts unstamped nodes only during
hydration. Normal client updates retain external stream boundaries, list nodes,
interactive controls, and their listeners while continuing to update, reorder,
and remove children created by Octane itself.
