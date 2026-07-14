# Apollo Client port plan

`@octanejs/apollo-client` targets the stable `@apollo/client@4.2.6` release and
keeps Apollo 4's package boundary: the framework-neutral client remains the
upstream peer, while the `/react` adapter is maintained against Octane.

## Current milestone: client adapter

- All 18 runtime exports from `@apollo/client/react` are present.
- The published 4.2.6 hook overloads and query-reference types are preserved.
- Apollo's query-reference and Suspense-cache internals are vendored from the
  pinned release because they are adapter-private but framework-neutral.
- Apollo's React-17 external-store shim delegates to Octane's native
  `useSyncExternalStore`.
- Suspense hooks use Octane `use()` with the calling hook's compiler-provided
  site identity.
- `MockedProvider` is a function component using Apollo's unchanged `MockLink`.
- Runtime exports, client lifecycles, lazy-query render guards, and the primary
  query/mutation/reactive-variable paths are covered by binding tests.

## Next milestone: buffered SSR and hydration

Apollo's classic `useQuery` does not suspend. Its React SSR integration therefore
wraps the hook, holds observable subscriptions across renderer passes, waits for
non-loading results, and renders again. The Octane port should retain that
algorithm while returning Octane's `{ html, css }` result:

1. Add an Octane-native `prerenderStatic` on `/react/ssr`.
2. Preserve `ssr: false`, `no-cache`, error, and maximum-rerender behavior.
3. Extract a per-request client's cache after rendering.
4. Restore the cache before `hydrateRoot`, including Vite `preHydrate` examples.
5. Test request isolation, nested waterfalls, scoped CSS, cache restoration, and
   duplicate-fetch prevention.

Automatic cache patches for streaming boundaries remain a later milestone; a
single pre-stream cache snapshot cannot include writes made by boundaries that
finish afterward.

## Upgrade procedure

1. Pin a stable Apollo release and commit; do not track `main` or prereleases.
2. Diff its published `react/` adapter against `packages/apollo-client/src/react`.
3. Reapply the documented Octane transforms rather than copying React Compiler
   output.
4. Lock runtime exports in both directions and run public type tests.
5. Run the packed-consumer smoke without React or `@types/react` installed.
