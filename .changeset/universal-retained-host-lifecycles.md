---
'octane': patch
---

Universal target: host lifecycle callbacks now fire for retained hosts that a
parent reorder physically moves. Placement planning sees retained subtrees
through their committed records, so the lifecycle pass collects hosts as
records too instead of missing them in the draft map.
