---
'octane': patch
'@octanejs/devtools': patch
---

Devtools at large-tree scale. The bridge's tree rebuild now memoizes per
subject: a rebuild reuses the exact node object for every subtree whose
displayed fields and children are unchanged, making node reference identity
the documented change signal of `getTree()` (labels/sources invalidate via an
HMR generation; live flags are re-compared on every walk, so flag flips
without a re-render can never serve stale). The element picker resolves
targets through a lazily built reverse index of block boundary nodes — one
`parentNode` walk per query instead of a full tree walk per hovered element —
with the exact walk kept as fallback; the index drops on every commit and
never pins DOM. The panel's component tree is virtualized: visible rows
flatten into a fixed-height windowed list, so DOM cost is bounded by the
viewport instead of the expanded tree, and rows are memoized against the
bridge's node identity so refreshes re-render only rows that actually
changed.
