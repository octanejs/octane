---
'octane': patch
---

`octane/data`'s data owner keeps a newer reply to a read beside an older one still waiting to be saved, so a tab that refreshes a read before its last value was saved no longer sends the whole value back to the worker.
