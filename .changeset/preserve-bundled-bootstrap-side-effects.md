---
'octane': patch
'@octanejs/tanstack-start': patch
---

Preserve compiler-hook registration and TanStack Start client hydration when
their bootstrap entrypoints are imported for side effects in production bundles,
while keeping unrelated package modules tree-shakeable.
