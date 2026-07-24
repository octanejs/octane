---
'@octanejs/vite-plugin': patch
---

Add an `octane({ devtools: true })` option that auto-enables the profile compile
flag in dev (via a command-aware `profile: 'auto'` resolution) and off in
production builds, powering the new `@octanejs/devtools` plugin.
