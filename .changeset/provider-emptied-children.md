---
"octane": patch
---

Remove a `.tsx` `<Context value>` Provider's previous children when they become `null` or `undefined`. They used to stay mounted, with their effects and state, until the Provider rendered children again.
