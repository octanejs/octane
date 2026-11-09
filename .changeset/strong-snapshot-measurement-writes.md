---
'octane': patch
---

Strong mode now rejects DOM writes inside a `useLayoutSnapshot` measurement (`OCTANE_STRONG_LAYOUT_SNAPSHOT_WRITE`). A write to a rendered element's style, class, attributes, children, or scroll offset makes every later measurement in the batch lay out again.
