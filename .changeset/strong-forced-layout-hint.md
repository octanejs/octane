---
'octane': patch
---

Strong mode now reports a hint, `OCTANE_STRONG_FORCED_LAYOUT`, when a function writes to an element the template renders and then reads its layout (`offsetHeight`, `getBoundingClientRect()` and similar), or does both in a loop. The read makes the browser lay out synchronously. `octane analyze` lists the hint and the build prints it as a warning; it never fails the module. A read whose value is dropped, such as `void element.offsetHeight`, is treated as a deliberate flush.
