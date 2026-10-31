---
'@octanejs/wagmi': patch
---

`@octanejs/tanstack-query` is now a peer dependency, as `@tanstack/react-query` is for `wagmi`, so the hooks read the application's `QueryClientProvider`. Before, the binding pinned its own exact release, so an app on another `@octanejs/tanstack-query` release got a second copy with its own QueryClient context, and every query or mutation hook threw `No QueryClient set, use QueryClientProvider to set one` under the app's provider.
