---
'octane': patch
---

A `@{ … }` component passed to `Object.assign`, as in
`return Object.assign(Button, { Item })` inside a factory function, compiles
again. Since 0.7.0 the compiler treated every function passed to a call as one
that code would call, and rewrote it to return JSX. Inside a module-level
function, that rewrite rejected a directive such as `@if` in the component as
being in a module-level callback. `Object.assign` only stores or returns the
function, so the component keeps its template body, with its props, control
flow, and captured variables, on the client and the server. The same holds for
`Object.defineProperty`, `Object.defineProperties`, `Object.freeze`,
`Object.seal`, `Object.preventExtensions`, and `Object.setPrototypeOf`. A
directive in a function passed to a call that may call it, such as `xs.map(Row)`,
is still reported.
