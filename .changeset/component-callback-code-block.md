---
'octane': patch
---

A child `@{ … }` block inside JSX that a callback in a component body returns
can now read the callback's params, on the client and the server, and
hydrates. The compiler used to declare the block's render function in the
component body, outside the callback, so
`const row = (x) => <p>@{ const y = x + 1; <b>{y}</b> }</p>` threw
`x is not defined` at render. The block now compiles inside the callback,
keeps its hook state across parent updates, and its `@if`, `@for`,
`@switch`, and `@try` arms can read the callback's names. This also covers an
authored `{() => @{ … }}` child in such a callback, names bound in a nested
block of the callback, and the `.map` callback in setup or over a value that is
not an array.
