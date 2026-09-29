---
'octane': patch
---

A child `@{ … }` block inside JSX that a module-level callback returns now
renders, on the client and the server, and hydrates. The compiler used to drop
it silently, so `const row = (x) => <p>@{ const y = x + 1; <b>{y}</b> }</p>`
rendered an empty `<p>`. A render-only block now groups its output
transparently. A block with setup compiles in place, as the
`{() => @{ … }}` child it is shorthand for. It closes over the callback's
params, runs in its own render scope, and keeps its hook state across parent
updates. An `@if`, `@for`, `@switch`, or `@try` in that block's output, or in
an authored `{() => @{ … }}` child in a module-level callback, can now read
the callback's params. Its arms used to be hoisted to module scope, where
those params do not exist.
