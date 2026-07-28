---
'octane': patch
---

Add `useLinkedState` for local state that can be edited independently but should
reset or adjust when an input changes. The new value is available immediately,
without an effect or a state update during render. Calculations can inspect the
previous source and value, choose custom equality checks, and use the same
optional latest-value getter as `useState`.
