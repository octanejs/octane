---
'@octanejs/app-core': patch
'@octanejs/vite-plugin': patch
'@octanejs/rsbuild-plugin': patch
---

Keep routed hydration compatible with nonce-only Content Security Policies by
using canonical native dynamic imports and module-relative production preload
URLs that ignore authored document bases without duplicating page or
pre-hydrate module singletons.
