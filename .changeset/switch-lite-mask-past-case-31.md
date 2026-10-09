---
'octane': patch
---

A `@switch` case that calls a hook now gets its own render scope when it is the 33rd case or later. Such a case could take an earlier hookless case's flag, so a state update inside it re-rendered the component that owns the `@switch` instead of only the case.
