---
"octane": patch
---

`flushSync` now drains convergent `useLayoutEffect` → `setState` cascades synchronously (React parity).

Previously `flushSync` ran layout effects once, but any re-render a layout effect scheduled
(by calling a state setter) was deferred to a microtask instead of being flushed before
`flushSync` returned. React drains these synchronously, so a component whose layout effect
settles derived state across a couple of passes (e.g. a mount/exit-animation presence gate)
would be observed mid-cascade right after a `flushSync`.

`flushSync` now loops render → layout-effects until the queue settles, with **convergence
detection**: it keeps draining while each pass schedules only blocks not yet rendered in this
`flushSync` (a finite cascade propagating through the tree), and the moment a block
re-schedules **itself** a second time it treats the cascade as non-convergent, stops, and
hands the remainder to the async scheduler — which advances it lazily, one render per
microtask, exactly as before. This preserves octane's deliberate divergence from React for
non-convergent cascades (an unstable `useSyncExternalStore` `getSnapshot` returning a fresh
object every call re-schedules its component from every layout pass — React throws
"Maximum update depth exceeded" / warns "The result of getSnapshot should be cached";
octane neither hangs nor burst-renders). A count backstop (50) additionally bounds
pathological wide-but-finite chains. Passive (`useEffect`) effects stay post-paint,
except that pending passives flush before each new render wave (see the
passive-before-render changeset).
