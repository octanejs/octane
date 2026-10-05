---
'octane': patch
---

Stop component-local `derived$` and `query$` chains from re-rendering without end
while a value they read is pending or rejected (#1735, #1736, #1737).

Every render declares a component's `derived$` and `query$` handles again, so a
declaration that read another local `derived$` or `query$` captured a new handle
each time. Its captured values never compared equal, so every render ran its
computation again. When that result could never equal the committed one (a query
still pending, a rejected query's error, a new object), accepting it re-rendered
its readers, whose render declared it again. `act()` reported that the scheduler
did not stabilize, and in a browser the tab stopped responding while the query
stayed pending or after it was rejected.

A captured handle now matches the accepted one when it resolves to the same cell.
It differs only when its key selects another cell or when the render presents a
redeclared definition of that cell, so a dependent still reads the definition its
render presents. A local computation that reads other local handles also no
longer runs again on renders that change none of its captured values.
