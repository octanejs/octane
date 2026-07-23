---
'octane': patch
---

Reuse warmed SSR fetches when child components read statically named computed
props such as `props['aria-label']`.
