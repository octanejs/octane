---
"@octanejs/tanstack-start": patch
---

Align the Start client and server cores with Router's current route-matching contract so development requests and built SSR return the rendered application instead of HTTP 500 responses.

Use the current Router match store during client hydration and its route-refresh contract during hot reload.
