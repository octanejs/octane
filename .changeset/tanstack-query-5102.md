---
'@octanejs/tanstack-query': patch
---

Update TanStack Query bindings and the core dependency to 5.102.8. Match the new prefetch options and query-key tags, infinite-query defaults, mutation-state inference, passive queries and error handling. Restore mixed-query tuple inference and precise boundary props. Remove the upstream-retired experimental render-prefetch promise API and validate the full pinned runtime and type suites.

Declare Wagmi’s Query core dependency so its mutation options share the QueryClient type used by the native Query binding.

Declare the SSR integration’s Query core dependency so its options accept the same QueryClient instance type as the native provider.
