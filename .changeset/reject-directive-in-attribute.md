---
'octane': patch
---

A template directive written directly as a JSX attribute value now fails with a
compiler diagnostic naming the source position and the working form, instead of
crashing inside the printer with `Not implemented: JSXIfExpression`. The same
applies to `<ErrorBoundary>` in that position, which lowers to a directive node.
Assign the directive to a local and pass that local as the prop.
