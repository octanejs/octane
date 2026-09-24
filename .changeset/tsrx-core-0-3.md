---
'octane': patch
---

Update the shared TSRX compiler dependency to `@tsrx/core` 0.3.2. Each `@switch`
arm is now its own block scope, so two arms can declare the same local, and
`@import` inside a `<style>` block is now the `tsrx-css-import` compile error.

`octane/tsrx-iterable` also re-exports `map_iterable_async`, which core now uses
in the editor for a `@for` whose body awaits, so the loop binding keeps its type.
Type inspection claims only that loop's `@for` keyword.
