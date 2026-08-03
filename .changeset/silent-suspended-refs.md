---
'octane': patch
---

Keep host refs unpublished while an initial Suspense primary is hidden, and avoid detaching replacement refs that never committed before a suspended update.
