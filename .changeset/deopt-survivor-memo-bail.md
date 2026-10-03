---
'octane': patch
---

Update a surviving row of a value-position list without re-rendering the row itself when its new element names the component it already shows. Lists that `createElement` builds, as `.ts` bindings do, hand back a fresh element for every row on every render. Each surviving row used to run its own render only to reach the memo comparison of its component. A row whose props compare equal now bails with that comparison alone, and a changed row updates its component directly. Hydration, signal-owned trees, and any other change of child take the ordinary row render. In the memo-wall benchmark, a one-row change in a 1,000-row list makes about half as many function calls.
