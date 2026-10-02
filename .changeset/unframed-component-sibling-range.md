---
'octane': patch
---

When hydration finds other server content where a component call expects its
range, the component is now built where that content stood, and only that
content is discarded: a later sibling component keeps its server range and
adopts its server nodes instead of being rebuilt with a second mismatch report.
Hookless components that return a fragment now recover the same way. A
component that suspends while it is built this way, or a fragment rebuilt over
another component's range whose hole suspends, now leaves the server content on
screen until the attempt that completes, which reports the mismatch once.
