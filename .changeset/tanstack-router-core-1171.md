---
'@octanejs/tanstack-router': minor
'@octanejs/tanstack-start': minor
'@octanejs/tanstack-router-ssr-query': minor
---

Adopt `@tanstack/router-core@1.171.34` and `@tanstack/start-server-core@1.169.39`,
which also ships the fix for **CVE-2026-102989** (the critical unauthenticated
reflected XSS in TanStack Start server-function response handling) to consumers —
superseding the repo-only pnpm patch (octanejs/octane#1478).

router-core 1.171.34 is a ground-up change to the shared router internals the
bindings build on, so `@octanejs/tanstack-router` was re-ported onto it:

- **Store model:** the pooled match stores (`matchStores`, `firstId`,
  `pending*`/`cached*`, `loadedAt`, `hasPending`, `matchesId`, …) are replaced by
  the normalized `{ ids, byRoute, __store, getMatchStore }` model. Match-tree
  components (`Match`, `Matches`, `Outlet`, `MatchRoute`, hooks) now key by route
  id via `getMatchStore(routeId)`, and the not-found flag migrated
  `globalNotFound` → `_notFound`.
- **Navigation / suspense:** `router.startTransition` is now the Promise-based
  render-acknowledgement protocol router-core awaits; the pending/loading/resolved
  lifecycle (and HTTP status + redirects) moved into router-core / the server
  request handler. A pending match suspends on the active transaction.
- **SSR serialization:** reworked onto router-core's new `ServerSsr` /
  `getSsrStatus` / stream-transform APIs (the old buffered-HTML/script-barrier
  pull API is gone); the streaming renderer folds octane's scoped styles into the
  document head and emits the doctype.

`@octanejs/tanstack-router-ssr-query` moves to `@tanstack/router-ssr-query-core@1.169.3`
(new `ServerSsr` API and `query: { initial, stream }` dehydration shape).

Behavioral note for consumers: SSR HTTP status and redirects are now derived by
the server request handler rather than exposed on `router.state`; a client-only
(`ssr: false`) pending match renders its pending UI in place
(`// OCTANE DIVERGENCE`) rather than suspending the outer boundary.
