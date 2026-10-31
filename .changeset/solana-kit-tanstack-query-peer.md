---
'@octanejs/solana-kit': patch
---

`@octanejs/tanstack-query` is now an optional peer dependency, as `@tanstack/react-query` is for `@solana/react`, so `useRequestQuery` from `@octanejs/solana-kit/query` reads the application's `QueryClientProvider`. Before, the binding pinned its own exact release, so an app on another `@octanejs/tanstack-query` release got a second copy with its own QueryClient context, and `useRequestQuery` threw `No QueryClient set, use QueryClientProvider to set one` under the app's provider. `skipToken` now comes from `@octanejs/tanstack-query` too, and the direct `@tanstack/query-core` dependency is gone, so the token always matches the query engine's copy. Install `@octanejs/tanstack-query` next to `@octanejs/solana-kit` if you use the `query` subpath.
