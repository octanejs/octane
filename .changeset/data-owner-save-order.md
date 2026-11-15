---
'octane': patch
---

Fix `octane/data`'s shared owner saving an older value over a newer one. When two tabs reloaded the same read and the reply to the older request landed last, the owner saved that tab's value over the newer one, so the next session started from stale data while the live tabs showed the newer value. The owner now keeps the value of the newest request it made for each read.
