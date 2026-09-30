---
'octane': patch
---

A `@{ … }` function passed as a call argument, such as
`{rows.map((row) => @{ <li key={row}>{row}</li> })}`, now renders what
`(row) => <li key={row}>{row}</li>` renders, on a client mount and update, on
the server, and through hydration. The compiler compiled such a function only
as a render body that the runtime calls with a render scope. `map` called it
with the row index in that position, so a client mount threw `Cannot read
properties of undefined`. A `@{ … }` function passed inline to any call or
`new`, or a nested `@{ … }` helper passed to one (`rows.flatMap(row)`,
`run(row)`), now compiles to the returned-JSX form that `@{ … }` is shorthand
for. Render props, `{fn}` children, `<Tag />` uses, portal bodies, and the
component given to `memo` or `createElement` still render through the compiled
template.
