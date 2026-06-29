---
"octane": patch
---

Fix children passed from a `.tsrx` parent through a `.ts` component that forwards them
onto a host element via `createElement` (e.g. a binding component like
`@octanejs/floating-ui`'s `FloatingOverlay` doing `createElement('div', { children })`).

Two issues are addressed:

- `descNeedsBlocks` now treats a render-FUNCTION child as needing a Block. The `.tsrx`
  lowering of `<Host>{children}</Host>` passes `props.children` as a component body (not a
  descriptor); previously such a child reached the raw de-opt reconciler and rendered as
  nothing.
- `childSlot` now reconciles a bare render-function child by SLOT (swapping the block body
  in place) instead of by identity. A `.tsrx` children body is re-created every render, so
  identity-based reconciliation re-mounted the child on every parent render — losing its
  state and, once effects re-rendered the tree, looping unboundedly.

`.tsx` callers (which pass descriptor children) were unaffected; this fixes the `.tsrx`
→ `.ts`-component children path.
