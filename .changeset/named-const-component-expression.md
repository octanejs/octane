---
'octane': patch
---

Fix a component declared as `const X = function Name(props) @{ … }` that refers
to itself as `Name`, for example to render `<Name />` recursively from an `@if`,
`@for`, or `@switch` arm. The compiler binds such a component as `X` and dropped
`Name`, so client and server rendering threw a `ReferenceError`. When the module
also declared its own `Name`, the component silently rendered that one instead.
`Name` now refers to the component inside its body, as in JavaScript. The
compiler rejects the rare self-references it cannot alias: one in a parameter
default or computed key, or one in a component that also declares `Name` or `X`
inside itself. Components that never refer to themselves by their function name
compile exactly as before.
