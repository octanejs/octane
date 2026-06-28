---
"octane": patch
---

`createPortal(...)` now renders as an ordinary renderable VALUE — at any position,
not only as a direct `{createPortal(...)}` child of a host element. Returning a
portal from a component (`return createPortal(...)`), placing one in a ternary
(`{cond ? createPortal(...) : null}`), at a fragment root (`<>{createPortal(...)}</>`),
in an array (`useDecorators`-style), or from a render function all work now. A custom
portal body may be a component (`createPortal(Comp, target, props)`) or inline JSX
(`createPortal(<Comp/>, target)`). The host-element-child form keeps its lowered
fast path; everything else routes through the de-opt `childSlot`, which renders the
`PortalDescriptor`, flows context, and tears down cleanly (no orphan markers).

Also fixes a latent bug in the return-value render path: a component whose `return`
flips between a single-root component (the markerless `componentSlot` path) and
`null` / a portal / an array (the `childSlot` path) — e.g. a placeholder toggling on
and off, or a typeahead menu opening and closing — corrupted its return slot and
crashed. The slot is now disposed when its shape changes, so it rebuilds cleanly.
