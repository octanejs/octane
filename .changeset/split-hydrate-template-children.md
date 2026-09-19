---
'octane': patch
---

Reduce production client bundles for compiler-extracted Hydrate templates without an authored fallback. Code-split boundaries reuse the compiled-child policy while preserving preload captures, native hydration, suspension, retry and cleanup. Authored overrides and opaque callers retain the general rendering path.
