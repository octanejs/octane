---
'octane': patch
---

Keep directive-local bindings inside split `<Hydrate>` boundaries.

A `@catch (error, reset)` reset parameter, an `@for` index, an `@switch` arm
local, or a `case` local inside a handler is no longer passed from the parent
component into the split child, where it was undefined and threw a
`ReferenceError` during hydration. `@empty` now reads the enclosing scope
rather than the loop binding, so the outer value reaches the split child. A
boundary nested inside one of these scopes also keeps the directive binding
instead of picking up a same-named module declaration.
