---
'octane': patch
'@octanejs/vite-plugin': patch
'@octanejs/rsbuild-plugin': patch
---

Add Octane-owned production error codes with full development messages, compact
documentation links in optimized builds, and progressive React-inspired developer
diagnostics. Production Vite and Rsbuild server bundles now fold the runtime mode
at build time so complete development diagnostics are removed without relying on
server minification.
