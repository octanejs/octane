---
'octane': patch
---

Return `@else if` branch values on universal renderers. An `@else if` arm
parses to an `IfStatement` alternate, which the universal compiler routed
through block codegen: the chained branch values were emitted as setup
statements and the else thunk returned an empty range, so every arm but the
first rendered nothing. The else thunk now returns the chained `universalIf`
value, so `@if`/`@else if`/`@else` chains — including chains nested inside
another arm — select their branch correctly.
