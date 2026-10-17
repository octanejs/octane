---
"octane": patch
---

Remove a Provider's previous children when they become `null` or `undefined`, for both a `.tsx` `<Context value>` and `CompiledContext`. They used to stay mounted, with their effects and state, until the Provider rendered children again.
