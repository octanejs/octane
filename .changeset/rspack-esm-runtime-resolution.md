---
'@octanejs/rspack-plugin': patch
---

Resolve Octane runtime aliases with Rspack's ESM conditions and keep compiler
helpers, server rendering, and profiling on the application's selected Octane
package. This fixes callback-ref and linked-package context regressions and
prevents the CommonJS runtime graph from being retained in browser bundles.
