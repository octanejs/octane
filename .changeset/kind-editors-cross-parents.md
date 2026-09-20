---
'octane': patch
---

Fix focused DOM moves between parents in browsers without native `moveBefore`, including staged commits. Cross-parent insertions no longer enter the sibling-rotation fallback or incorrectly skip appending a node, while same-parent reorders retain editing continuity.
