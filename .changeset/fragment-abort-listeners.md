---
'octane': patch
---

Fragment `addEventListener` now follows `AbortSignal` like `EventTarget`. Aborting the signal ends the registration, so the same callback can be added again. A signal that is already aborted registers nothing, and the options are copied when the listener is added.
