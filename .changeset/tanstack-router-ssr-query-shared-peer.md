---
'@octanejs/tanstack-router-ssr-query': patch
---

`@tanstack/query-core` is now a peer dependency (`^5.102.8`), as it is for `@tanstack/react-router-ssr-query`. Before, the binding installed its own copy, so `@tanstack/router-ssr-query-core` resolved its query-core peer to that copy instead of the application's. Install `@tanstack/query-core` next to `@octanejs/tanstack-router-ssr-query` if your app does not already have it.
