---
'octane': patch
---

Commit components updated together in the order their updates were scheduled, apart from rendering a queued ancestor first, so siblings that read one external store attach refs and run layout effects in tree order even when one of them sits deeper, inside an `@if` arm.
