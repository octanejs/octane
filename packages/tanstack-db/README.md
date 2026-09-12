# @octanejs/tanstack-db

Octane live-query hooks for [TanStack DB](https://github.com/TanStack/db).

## Installation

```sh
npm install @octanejs/tanstack-db octane
pnpm add @octanejs/tanstack-db octane
```

Re-exports [`@tanstack/db`](https://tanstack.com/db) unchanged and implements its
live-query binding surface on Octane hooks:

- `useLiveQuery`
- `useLiveInfiniteQuery`
- `useLiveSuspenseQuery`
- `useLiveQueryEffect`
- `usePacedMutations`
- `DbProvider`, `useDbClient`, `useOptionalDbClient`
- `HydrationBoundary`

Install `octane` alongside this package and configure the Octane compiler in your
build tool (see [octanejs.dev](https://octanejs.dev/docs/build-tools)).

## Compatibility

Ports `@tanstack/react-db@0.3.8` and re-exports `@tanstack/db@0.9.0` unchanged.
The adapter includes `DbProvider`, `useDbClient`, `useOptionalDbClient` and
`HydrationBoundary`, alongside all five live-query and mutation hooks.

Use `DbProvider` to share a `DbClient`; `HydrationBoundary` applies dehydrated
collection state before its children render. Query identity is derived from
structured query IR. Use an explicit `queryKey` for opaque functional queries;
the legacy dependency-array form remains supported with a development warning.
`fetchNextPage()` returns a promise that resolves when the page is available.

Octane uses compiler-assigned hook slots and has no React StrictMode double
invocation. Suspense uses the same promise/error behavior as the pinned adapter.
See `UPSTREAM.md` for provenance, ownership and verification evidence.
