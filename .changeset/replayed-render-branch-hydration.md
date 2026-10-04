---
'octane': patch
---

Hydrate each `@if` and `@switch` into its own server range when a component's first render updates its own state while it evaluates a slot's arguments. The replayed render no longer reports a mismatch and rebuilds the server markup.
