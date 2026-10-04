---
'octane': patch
---

Passive effects that run ahead of a `flushSync` render, including the drains of a synchronous `act()` callback, now count their updates as passive work, as React does. Octane previously counted them against the synchronous budget. A passive cascade that renders fine in a normal flush therefore threw "Maximum update depth exceeded" after about 50 steps under synchronous `act()`. A `flushSync` that the passive effect calls itself still counts as synchronous, so `flushSync`-in-`useEffect` loops still throw. Callback refs and `useSyncExternalStore` checks in the commit that such a `flushSync` starts keep the usual limit.
