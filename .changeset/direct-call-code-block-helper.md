---
'octane': patch
---

A `@{ … }` function declared inside a component or another function, such as
`const row = (v) => @{ <p>{v}</p> }` or `function row(v) @{ … }`, can now be
called directly: `{row(props.v)}` and `{rows.map(row)}` render what
`(v) => <p>{v}</p>` renders, on a client mount, on the server, and through
hydration. The compiler compiled such a function only as a render body that the
runtime calls with a render scope, so a direct call threw `Cannot read
properties of undefined` on the client, and the server rendered its output
without the range hydration expects. When code calls it directly, the function
now compiles to the returned-JSX form that `function f() @{ … }` is shorthand
for. It still renders when passed as a `{row}` child, a component, or a portal
body.
