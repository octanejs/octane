---
'octane': patch
---

`OctaneCompat` now disconnects an island hidden by React `Activity` before it
applies a child identity, prop, or context change committed in the same hiding
commit, so a replaced child's layout cleanup runs before its insertion cleanup,
as in React.
