---
"@octane-ts/query": patch
---

Initial release: TanStack Query bindings for octane.

Reuses `@tanstack/query-core` verbatim (QueryClient, observers, caches) and reimplements
the React binding on octane's hooks. Ships `QueryClientProvider`, `useQueryClient`,
`useQuery`, and `useMutation`, plus a verbatim re-export of query-core. Most query code
works by changing the import from `@tanstack/react-query` to `@octane-ts/query`. Verified
against the real query-core (async pending → success/error lifecycle, mutations, context
client resolution) and byte-for-byte against real react-query for the synchronous
result shape via the differential rig.
