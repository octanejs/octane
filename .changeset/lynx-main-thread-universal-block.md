---
'@octanejs/lynx': patch
---

Render setup-bearing `@{ … }` child blocks on the Lynx main thread.

`@octanejs/lynx/main-renderer` now exports `universalBlock`. On the one-shot
first screen, a block renders one range at its position, like the child scope
the background claims for it, so host IDs, topology, and listener metadata
match the background renderer. The main renderer also exports `useFormState`,
which main-thread modules may import from `octane`.
