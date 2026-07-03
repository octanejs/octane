---
"octane": patch
---

Callback-ref cleanups are now paired per (ref, element), matching React 19.

React stores a callback ref's returned cleanup per attach site. Octane kept one
cleanup per ref FUNCTION, so the common list pattern — the same `ref={registerItem}`
on every row — overwrote earlier cleanups: removing row 1 ran row 2's cleanup and
row 2's later detach fell back to `ref(null)`. `attachRef` now keys cleanups by
(ref, attached element/fragment) and every detach site (runtime and compiled output)
passes the element it is releasing, so exactly the right cleanup runs.
