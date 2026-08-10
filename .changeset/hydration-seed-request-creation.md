---
'octane': patch
---

Reuse server-provided hydration data before creating compiler-owned async
requests, preventing duplicate client fetches while preserving Suspense and
external hydration ownership.
