---
'octane': patch
---

A passive effect that advances state on each commit no longer throws "Maximum update depth exceeded" after about 50 steps when a layout effect, `useLayoutSnapshot`, ref callback or `useSyncExternalStore` sync publishes one converging update per commit. `useLayoutSnapshot` no longer reports such a cascade as a snapshot that did not converge. Octane counted those synchronous updates across the whole passive cascade. React resets the count whenever a commit leaves no synchronous work, and Octane now does the same, so each passive-driven commit starts a fresh budget.

Passive effects that run ahead of a re-render join it, so such a cascade can spend the budget without ever settling. When that happens, Octane renders the pending synchronous updates once without the waiting passive effects. A cascade that settles continues after paint with a fresh budget, and development builds warn about the long passive cascade, as React does. Layout, ref-callback, store-sync and `flushSync`-in-`useEffect` loops still throw.
