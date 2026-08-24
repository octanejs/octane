---
'octane': patch
---

Reduce streaming server-render work by checkpointing changed Suspense boundaries instead of copying the entire boundary registry for every component. Preserve render-phase retry state, discovery order, hydration seeds, and error handling.

Avoid general keyed-child bookkeeping for a single owned text node, and avoid reclassifying host subtrees that already require component reconciliation. Keep text identity, foreign DOM ownership, and interrupted-update rollback unchanged.
