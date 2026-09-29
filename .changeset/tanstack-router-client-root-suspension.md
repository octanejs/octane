---
'@octanejs/tanstack-router': patch
---

`RouterClient` no longer wraps the router in a Suspense boundary while
`hydrate()` runs, matching upstream, which suspends through `<Await>` with no
fallback.

The boundary caused two problems. With `hydrateRoot`, it had no match in the
server HTML from `RouterServer`, so hydration reported a mismatch, removed the
server DOM, and rebuilt the page on the client. With `createRoot`, its empty
fallback committed first, so the hydrated tree counted as a Suspense retry and
stayed hidden for up to 300ms. In both cases, the root layout was blank while
an `ssr: false` child route was still pending.

`RouterClient` now suspends at the root. `hydrateRoot` keeps and adopts the
server DOM, and the root layout and the child's pending component appear as soon
as `hydrate()` settles.
