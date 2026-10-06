---
'@octanejs/intersection-observer': patch
---

Reset `useInView` when the observed element is replaced by a different one in the same update. The hook kept reporting the previous element's `inView: true` and `entry` until the replacement crossed the viewport, because the replacement's first not-intersecting notification is suppressed. It now returns to `initialInView` with no entry as soon as the ref points at a new element.
