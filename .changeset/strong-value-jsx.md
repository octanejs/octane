---
'octane': minor
---

Strong mode rejects markup outside template output with `OCTANE_STRONG_VALUE_JSX`. JSX returned from a function, assigned to a variable, passed as a prop value or argument, or chosen by a conditional or logical expression builds an element descriptor, which renders through the generic descriptor renderer. So does an `@{ … }` block stored in an object or chosen by an expression. Write component bodies as `@{ … }`, pass markup to a component prop as `prop={@{ … }}` or as a component, and choose markup with `@if` or `@switch`.

`<ErrorBoundary fallback={@{ … }}>` now renders the body instead of calling it as an `(error, reset)` render prop.
