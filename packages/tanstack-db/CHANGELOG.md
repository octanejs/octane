# @octanejs/tanstack-db

## 0.0.4

### Patch Changes

- Updated dependencies [489a886]
- Updated dependencies [922b2d4]
- Updated dependencies [814a3c1]
  - octane@0.1.41

## 0.0.3

### Patch Changes

- Updated dependencies [ff9b859]
- Updated dependencies [14b8b40]
- Updated dependencies [cc6e5ea]
  - octane@0.1.40

## 0.0.2

### Patch Changes

- 0fc84da: Add `@octanejs/tanstack-db`: Octane live-query bindings for `@tanstack/db`. Re-exports `@tanstack/db@0.7.0` unchanged and ports the React live-query surface of `@tanstack/react-db` (`useLiveQuery`, `useLiveInfiniteQuery`, `useLiveSuspenseQuery`, `useLiveQueryEffect`, `usePacedMutations`) onto Octane hooks. `useLiveQuery`/`useLiveSuspenseQuery` run on db's shared `createLiveQueryObserver` and `useLiveInfiniteQuery` on the coordinated `createLiveQueryWindowController`, so status-only changes are observed, infinite-query windows are coordinated across hooks, and a failed page load rolls back and surfaces an error. Suspense integrates via Octane's `use(thenable)`.

  Allow browser-only TypeScript consumers to compile the reachable Octane client runtime without installing Node ambient types, while preserving the literal development-mode guards used for bundler substitution.

- Updated dependencies [954028b]
- Updated dependencies [21f4dfb]
- Updated dependencies [1cb4a19]
- Updated dependencies [0fc84da]
  - octane@0.1.39

## 0.0.1

Initial release of the Octane framework adapter for TanStack DB.
