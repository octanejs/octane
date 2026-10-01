---
'octane': patch
'@octanejs/mcp-server': patch
---

Add `OCTANE_STRONG_EFFECT_HIDDEN_DEPENDENCY`. Strong effect setup may no longer call a state getter, read `current` from a value ref, or read a reassigned module `let` or `var`, because none of them is an inferred dependency. Refs attached with `ref=` or passed to a call, component, or hook remain readable, and reads in cleanup, deferred callbacks, and `useEffectEvent` callbacks remain valid. Compatibility modules and emitted code are unchanged.
