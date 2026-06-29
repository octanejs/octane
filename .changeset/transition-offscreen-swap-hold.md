---
"octane": patch
---

Transitions now keep the previous content on screen when they swap in a NEW subtree
that suspends — matching React's concurrent transition + Suspense contract. Previously
octane held prior content only for an IN-PLACE re-suspend (the same component re-renders
and throws before mutating); a transition that REPLACED one component/branch with a
different one that suspended on mount tore the old content down first, so the boundary
went blank (no content, fallback suppressed) until the new subtree resolved.

The fix adds per-swap **off-screen (WIP-model) rendering**: at each swap site
(`componentSlot`, `childSlot`, `ifBlock`, `switchBlock`), a transition-priority swap to a
new subtree is rendered off-screen first, with its effects/ref-attaches captured so they
don't fire until commit. If it completes, it's committed atomically and the old subtree is
torn down; if it suspends, the partial is discarded and the suspend is re-thrown so the
enclosing `@try` boundary's existing transition hold keeps the OLD content live and resumes
+ commits once the data resolves. Urgent (non-transition) and hydration renders keep the
existing clear-then-render path. This also closes the `@octanejs/router` gap where a
concurrent navigation to a slow route briefly blanked instead of holding the current page.

Note: this is per-swap/per-boundary off-screen rendering, not a full double-buffered tree —
a single transition that fans out to multiple independent suspending regions reveals them
piecewise rather than all-at-once (same family as the documented entangled-transition
partial-commit divergence). Single-boundary transitions (route/tab/query-key changes) match
React's observable behavior.
