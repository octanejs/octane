---
"octane": patch
---

`memo()` now bails for components rendered at value positions, with React's lazy context propagation.

The React.memo bail lived only in `componentSlot` (compiled component positions) — a
memo'd component rendered as value-position children (context-provider children,
`createElement` trees in bindings) re-rendered unconditionally, and the
context-refresh walk missed consumers under a childSlot in ARRAY mode (its keyed list
lives in an embedded forSlot). Both same-component update paths now share the bail:
stable props skip the body, and only consumers of a CHANGED context re-render below
the bailed boundary (React's `['App','Consumer']` — no 'Indirection'). This is the
building block for expressing React's implicit same-element bailout in octane
bindings (e.g. Radix NavigationMenu's convergence).
