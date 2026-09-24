---
'octane': minor
---

Support `@{ … }` blocks at JSX child position on universal renderers. Setup-bearing blocks now compile to a new `universalBlock` descriptor that materializes inside a persistent child scope at the block's sibling position, matching the DOM `childSlot` lowering: hook state survives parent re-renders and effect cleanup runs when the scope is discarded. Empty blocks are dropped and render-only blocks merge into the parent template, and the explicit `{() => @{ … }}` scoped-child spelling lowers to the same form. `@{ … }` inside `@if`/`@for`/`@switch`/`@try` bodies — previously emitted as a raw statement that failed printing — compiles through the same path.
