# @octanejs/tanstack-db

Octane live-query hooks for [TanStack DB](https://github.com/TanStack/db).

## Installation

```sh
npm install @octanejs/tanstack-db
pnpm add @octanejs/tanstack-db
```

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

Ports the React live-query hooks of `@tanstack/react-db@0.1.96` onto Octane and
re-exports the framework-neutral `@tanstack/db@0.7.0` core unchanged.
`useLiveQuery`/`useLiveSuspenseQuery` run on db's shared `createLiveQueryObserver`
and `useLiveInfiniteQuery` on the coordinated `createLiveQueryWindowController`.

Intentional differences from React:

- **Suspense** integrates via Octane's `use(thenable)` rather than throwing a raw
  promise (observable behavior — fallback then data — matches).
- **`useLiveInfiniteQuery`** rejects a pre-created collection that lacks an
  `orderBy` synchronously during render, so the error reaches the caller.
- **StrictMode double-invocation** is not applicable (Octane has no development
  double-invoke).

See `UPSTREAM.md` for the pin and export crosswalk and `status.json` for the
tracked binding status.
