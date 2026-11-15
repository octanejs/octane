---
'octane': patch
---

Stop a view transition from playing `enter` on an unchanged `ViewTransition` boundary in an unrelated part of the tree. A transition that updates one subtree left other subtrees' boundaries out of its old capture, then counted them as newly mounted when it measured the new state.
