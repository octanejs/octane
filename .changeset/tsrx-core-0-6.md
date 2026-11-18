---
'octane': minor
'@octanejs/codemod': patch
'@octanejs/rspeedy-plugin': patch
---

Update the TSRX toolchain to `@tsrx/core` 0.6.3 and `@tsrx/oxc` 0.24.0. Install `@tsrx/oxc@0.24.0` as the Node compiler's parser peer.

Octane now reports TSRX2030 for a `var` declared in a nested `@{ … }` block or an `@if`, `@for`, `@switch` or `@try` body, as `@tsrx/core` does on its own targets. Previously Octane hoisted such a `var` to the component function, while the editor typed it in the block. Declare it with `const` or `let`, or move it to the component's setup.
