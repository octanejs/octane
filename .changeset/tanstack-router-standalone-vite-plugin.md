---
'@octanejs/tanstack-router': patch
'@octanejs/tanstack-start': patch
---

`@octanejs/tanstack-router` now ships a standalone `./vite` plugin (file-based
route generation + route-level code splitting) usable without
`@octanejs/tanstack-start`, mirroring upstream `@tanstack/router-plugin`.
`@octanejs/tanstack-start` now consumes this relocated implementation instead
of a private internal copy.
