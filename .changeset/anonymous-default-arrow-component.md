---
'octane': patch
---

Compile `export default () => @{ … }` exactly like `export default function () @{ … }`.
An anonymous default-exported arrow component used to skip component lowering.
It had no HMR registration, so an edit could not hot-update it in place, and it
missed the production stamps a function component gets. An `async` arrow also
compiled with no diagnostic. The arrow form now hot-updates under its `default`
export, server-renders, hydrates, and specializes production roots that render
it. An `async` arrow is rejected with an error that names `default`.

`export default (function Name() @{ … })` no longer redeclares a module binding
that shares the component's name. The component gets a fresh module binding,
and its body still resolves `Name` to the component itself. If a parameter
default or computed key refers to `Name`, or the body also declares its own
`Name`, the compiler asks you to rename the function expression.
