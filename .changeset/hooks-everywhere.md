---
'octane': patch
---

Hooks now work in any function, not just components. A custom hook (a plain `use[A-Z]` function) defined in a `.tsrx` module gets its base hooks slotted — previously it threw "useState was called without a slot symbol". Base hooks keep their per-call-site trailing slot; custom-hook calls are wrapped in `withSlot` so the SAME custom hook reused at two call sites (or composed inside another custom hook) keeps independent state. The runtime combines a base hook's own slot with the call-site path stack, so this composes without changing existing component or library-binding behavior.
