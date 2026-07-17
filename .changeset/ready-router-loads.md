---
"@octanejs/tanstack-router": patch
---

Make `router.load()` wait for platform-deferred View Transition match commits so an initial route can be rendered or hydrated immediately after the promise resolves, with commit failures and final error/not-found status codes preserved.
