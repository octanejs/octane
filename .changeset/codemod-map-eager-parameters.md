---
'@octanejs/codemod': patch
---

Flag more map destructuring expressions that may read the callback index before it is initialized. This protects against suppressing a `ReferenceError` when an eager arithmetic expression, unary expression, or first argument of a direct call becomes part of an `@for` loop.
