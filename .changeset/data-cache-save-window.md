---
'octane': patch
---

`octane/data`'s encrypted cache waits for 50 ms without a new value before saving the values that changed, and never more than half a second after the first, so a burst of replies or feed events is written once instead of once per host task. `persist.delay` sets the wait, and `0` keeps saving on the next host task. `dispose()` still saves what is waiting.
