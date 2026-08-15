---
'@octanejs/tanstack-db': patch
'octane': patch
---

Add `@octanejs/tanstack-db`: Octane live-query bindings for `@tanstack/db`. Re-exports `@tanstack/db@0.7.0` unchanged and ports the React live-query surface of `@tanstack/react-db` (`useLiveQuery`, `useLiveInfiniteQuery`, `useLiveSuspenseQuery`, `useLiveQueryEffect`, `usePacedMutations`) onto Octane hooks. `useLiveQuery`/`useLiveSuspenseQuery` run on db's shared `createLiveQueryObserver` and `useLiveInfiniteQuery` on the coordinated `createLiveQueryWindowController`, so status-only changes are observed, infinite-query windows are coordinated across hooks, and a failed page load rolls back and surfaces an error. Suspense integrates via Octane's `use(thenable)`.

Allow browser-only TypeScript consumers to compile the reachable Octane client runtime without installing Node ambient types, while preserving the literal development-mode guards used for bundler substitution.
