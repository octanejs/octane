---
"octane": patch
---

Performance: coalesce overlapping cascades in a batched flush.

When several components in the same subtree update in one batch, an ancestor's
re-render already cascades through its descendants — so the scheduler now skips
re-rendering a queued block that an ancestor's cascade already brought up to date
this flush, instead of rendering it a second time from the queue. The render
queue is drained in depth-sorted waves (ancestors first), so this coalescing is
independent of the order the updates were queued in. For a batch that updates an
N-deep chain of stateful components, render work drops from O(N²) to O(N) (e.g. a
10-deep chain: 55 block renders → 10). Behavior is unchanged — every update is
still applied; only the redundant re-renders are removed. The depth sort runs
only on batches of more than one block, so single (the common case),
non-overlapping, and re-entrant updates are unaffected.
