---
"@octanejs/tanstack-router": patch
---

Make `router.load()` wait for platform-deferred View Transition match commits so an initial route can be rendered or hydrated immediately after the promise resolves, while sequencing prior pending callbacks without leaking their failures and preserving final success, redirect, error, and not-found status codes.
