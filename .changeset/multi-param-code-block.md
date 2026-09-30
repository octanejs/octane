---
'octane': patch
---

A `@{ … }` component that declares parameters after `props`, such as
`function Row(props, extra) @{ … }`, now renders. The runtime calls a component
as `(props, scope, extra)`, but the compiled body listed the scope after every
authored parameter, so rendering `<Row />` threw `Cannot read properties of
undefined (reading 'slots')` on the client. The body now always takes the scope
second, and each later parameter holds the argument at its position, exactly as
in the returned-JSX form `function Row(props, extra) { return … }`. While a
component renders, the parameters after `props` receive internal values rather
than `undefined`, so pass a component's inputs through props. A rest parameter
after the first, and a parameter default or destructuring pattern, bind the same
way.
