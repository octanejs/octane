---
'octane': patch
---

Clear a shared-parent keyed list by walking its marker span, falling back to
the scoped Range only once the list is large enough to pay for it.

A `@for` block that owns its parent is still cleared with `textContent = ''`.
One that shares its parent with other JSX previously always used
`Range.deleteContents()`. Measured in Chromium, that is the slower of the two
for every list size a page realistically clears — 2.2× at 10 items, 1.3× at
100 — and only pulls ahead by ~8-12% past roughly a thousand items, so the
strategy is now chosen by item count.

The gap is far wider off the browser. jsdom decides Range containment with a
boundary-point comparison per candidate node, each of which can walk the whole
document, making `deleteContents` cost O(items × document): 266× the walk when
clearing 100 items from a 3400-node document, growing with PAGE size rather
than list size. Any Octane component test that clears such a list paid it —
one route in this repo's own suite spent 2.8-7.3s in a single render, against
~150ms for the same component tree mounted directly, and now renders in ~200ms.

No change for the owns-parent case, which is what the existing `clear`
benchmarks exercise — every other suite's `@for` is the sole child of its
parent, so the shared-parent path had no coverage at all. The new `list-clear`
suite adds it, with both sizes and an owns-parent control, and gates each op on
the neighbours surviving the clear (a clear that took the wrong span would
otherwise report as a faster one).
