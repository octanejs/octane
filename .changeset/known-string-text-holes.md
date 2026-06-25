---
'octane': patch
---

Text holes no longer require an `as string` cast when the compiler can already see the value is a string. A `{expr}` hole is classified as text (rather than a renderable child) when `expr` is a string or template literal, a `+`-concatenation involving a string (e.g. `{'Count: ' + count}`), or a local `const`/param the compiler tracks back to a string (a provably-string initializer or a `: string` annotation). The classification runs identically on the server and client compile paths, so SSR markup and hydration stay in lockstep. Names a render scope re-binds (e.g. a `@for` loop variable) are excluded from tracking so they're never misclassified.
