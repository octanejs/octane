---
"octane": patch
---

`onScroll`/`onScrollEnd` now fire (React 17+ per-element semantics).

Native `scroll` doesn't bubble, so bubble-phase root delegation never received it —
element scroll handlers silently never fired (Radix Select's expand-on-scroll
viewport exposed it). `scroll`/`scrollend` are now capture-delegated and dispatched
to the scrolled element only, matching React 17+, where `onScroll` stopped bubbling
and ancestors receive their own scroll events natively.
