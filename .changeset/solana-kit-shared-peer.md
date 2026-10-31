---
'@octanejs/solana-kit': patch
---

`@solana/kit` is now a peer dependency (`^7.0.0`), as it is for `@solana/react`, so the binding uses the application's Kit instead of installing its own pinned 7.0.0. Install `@solana/kit` next to `@octanejs/solana-kit` if your app does not already have it.
