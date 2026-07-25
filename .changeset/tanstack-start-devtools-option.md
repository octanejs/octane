---
'@octanejs/tanstack-start': patch
---

Support `octane: { devtools: true }` in `tanstackStart(...)`. It forwards to the
compiler's command-aware `profile: 'auto'` (profiling on in dev, off in
production builds), powering the `@octanejs/devtools` panel. An explicit
`octane.profile` still takes precedence.
