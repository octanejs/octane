---
'octane': patch
---

A `@{ … }` function with a rest parameter, such as
`export function Join(...parts: string[]) @{ … }`, now loads and renders on
the client and the server, and hydrates. The compiled body appends its render
scope parameters after the authored ones, so it emitted
`function Join(...parts, __s, __extra)`, and the module threw
`SyntaxError: Rest parameter must be last formal parameter` when it loaded.
The server did the same for a returned-JSX function with a rest parameter,
even a helper that code only calls directly. The rest parameter now holds what
the returned-JSX form's rest parameter holds: a direct call's own arguments,
and for a component render the runtime's `(props, scope, extra)` arguments
from its position on. A TypeScript `this` parameter on a `@{ … }` function no
longer takes the place of the props, which had crashed the client render.
