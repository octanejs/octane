---
'@octanejs/tanstack-router': patch
'@octanejs/tanstack-start': patch
---

Preserve opaque virtual module identities throughout TanStack Start compilation, harden server-only `ClientOnly` stripping, derive route HMR mode from the active bundler, and inline server checks so bundlers can analyze them directly.
