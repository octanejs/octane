# @octanejs/tanstack-db

Octane live-query hooks for [TanStack DB](https://github.com/TanStack/db).

Re-exports [`@tanstack/db`](https://tanstack.com/db) unchanged and implements its
live-query binding surface on Octane hooks:

- `useLiveQuery`
- `useLiveInfiniteQuery`
- `useLiveSuspenseQuery`
- `useLiveQueryEffect`
- `usePacedMutations`

Install `octane` alongside this package and configure the Octane compiler in your
build tool (see [octanejs.dev](https://octanejs.dev/docs/build-tools)).

## Compatibility

Ported from `@tanstack/db@0.6.17`. Suspense integrates via Octane's
`use(thenable)` rather than throwing a promise (observable behavior matches).
See `status.json` for the tracked binding status.
