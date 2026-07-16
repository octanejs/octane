---
'@octanejs/three': patch
'octane': patch
---

Add the R3F-compatible `useLoader` cache, preload/clear helpers, retained Three
Suspense and Activity behavior, real browser asset loading, and client
pending/error projection through `Canvas`. Preserve universal host roots while
their DOM owner is hidden and allow updated hidden Suspense content to retry
without waiting for an obsolete promise.
