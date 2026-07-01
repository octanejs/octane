---
"octane": patch
---

`flushSync` now drains `useLayoutEffect` → `setState` cascades synchronously (React parity).

Previously `flushSync` ran layout effects once, but any re-render a layout effect scheduled
(by calling a state setter) was deferred to a microtask instead of being flushed before
`flushSync` returned. React drains these synchronously, so a component whose layout effect
settles derived state across a couple of passes (e.g. a mount/exit-animation presence gate)
would be observed mid-cascade right after a `flushSync`. `flushSync` now loops
render → layout-effects until the queue settles, bounded (50) to avoid an unbounded loop —
the tail, if any, still spills to the async scheduler as before. Passive (`useEffect`) effects
are unaffected (still post-paint).
