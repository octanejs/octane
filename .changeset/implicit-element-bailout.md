---
'octane': patch
---

Implement React's implicit same-element bailout, and fix a context-propagation bug the work surfaced:

- **Implicit bailout (React beginWork's `oldProps === newProps` skip):** re-rendering a parent that passes an identical (reference-equal) element to a value position (provider children, `.ts` binding trees, `return children` passthroughs, cached array items) now skips that child's body outright, while consumers of a changed context inside the bailed subtree still refresh via lazy per-context propagation. Value-position component blocks are armed as context-stamping targets (like `memo()` blocks) so the bail is always sound; compiled template positions re-create props per render and pay nothing. `@octanejs/radix`'s NavigationMenu no longer needs its `MemoChildren` memo() shim or its shallow-equal registration convergence bail — both were workarounds for this exact gap and are now deleted.
- **Bugfix — bailed subtrees no longer strand context consumers:** a memo boundary's re-render (own props changed) interleaved with an inner memo bail used to erase the outer boundary's recorded context dependencies (its `$$ctxReads` cleared, the bailed inner subtree never re-stamping them), so a LATER context change could bail straight past the consumer and leave it on a stale value. Bails now re-stamp the bailed block's surviving context deps onto memo/armed ancestors.
