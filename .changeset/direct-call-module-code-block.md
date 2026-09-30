---
'octane': patch
---

A module-level `@{ … }` function, such as `function Row(v) @{ <p>{v}</p> }` or
`const row = (v) => @{ … }`, can now be called directly from the same module:
`{Row(props.v)}`, `Row.call(null, v)`, and `{items.map(Row)}` return what the
returned-JSX form `function Row(v) { return <p>{v}</p>; }` returns, on a client
mount, on the server, and through hydration. The compiler compiled such a
function only as a component body, which the runtime calls with a render scope,
so a direct call threw `Cannot read properties of undefined (reading 'slots')`
on the client, and the server rendered its output without the range hydration
expects. A directly called function now also gets its returned-JSX form, which
its body runs when it is not called to render. Its setup and hooks run in the
caller, an early `return null` returns null, and its JSX resolves where the
value renders. Rendering it as `<Row />` or a `{Row}` child still runs the
compiled template, and modules without direct calls compile unchanged.
