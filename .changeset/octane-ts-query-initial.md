---
"@octane-ts/query": patch
---

Initial release: TanStack Query bindings for octane.

Reuses `@tanstack/query-core` verbatim (QueryClient, observers, caches) and reimplements
the React binding on octane's hooks. Ships the full hook surface — `useQuery`,
`useInfiniteQuery`, `useSuspenseQuery`, `useSuspenseInfiniteQuery`, `useQueries`,
`usePrefetchQuery`, `usePrefetchInfiniteQuery`, `useMutation`, `useMutationState`,
`useIsFetching`, `useIsMutating`, `useQueryClient`, `useIsRestoring`,
`useQueryErrorResetBoundary` — plus the `QueryClientProvider`, `HydrationBoundary`,
`IsRestoringProvider`, and `QueryErrorResetBoundary` components and a verbatim
re-export of query-core. The whole `@tanstack/react-query` surface is bound. Most query code
works by changing the import from `@tanstack/react-query` to `@octane-ts/query`. Verified
against the real query-core (async lifecycle, mutations, infinite/parallel queries,
suspense via `<Suspense>` / `@try`, prefetch, hydration, fetching/mutating status) and
byte-for-byte against real react-query for the synchronous result shape via the
differential rig.
