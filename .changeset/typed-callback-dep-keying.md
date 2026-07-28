---
'octane': patch
---

A hook callback written through a type assertion — `((s) => s.total) as Sel` —
is now recognised as a callback. It previously matched neither the module-scope
lift nor dep-keying, because both tested the argument's node type directly and a
`TSAsExpression` is not an arrow, so a typed selector silently kept its
per-render identity churn.

Both passes now peel the assertion, and both move the UNWRAPPED function. The
assertion is erased from the emitted module either way, and dropping it means a
type alias declared inside the component cannot be dragged out to module scope
by the lift.
