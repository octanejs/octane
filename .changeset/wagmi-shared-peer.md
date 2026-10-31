---
'@octanejs/wagmi': patch
---

`viem` is now a peer dependency (`^2.55.10`), as it is for `wagmi`, so the binding uses the application's Viem instead of installing its own. `@tanstack/query-core` is now a peer dependency (`^5.102.8`) too: `@wagmi/core/query` imports it as an optional peer, which resolved to a copy the binding installed instead of the application's. Install `@tanstack/query-core` next to `@octanejs/wagmi` if your app does not already have it.
