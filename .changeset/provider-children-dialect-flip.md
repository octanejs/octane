---
'octane': patch
---

Fix a context Provider corrupting the tree when its children switch dialect.

A Provider accepts its children either as the compiled children-block function a
`.tsrx` parent passes, or as an element descriptor from a `createElement` parent.
Both claimed `scope.slots[0]` — a compiled body stores its binding bag there,
while the descriptor path stores a `childSlot` record — so a parent that wraps
its children conditionally, and therefore alternates between the two shapes
across renders, had the incoming dialect read the outgoing one's record as its
own. The result was a `TypeError` and a detached subtree.

The children now remount across such a flip, which is the same contract React
gives an element-type change.
