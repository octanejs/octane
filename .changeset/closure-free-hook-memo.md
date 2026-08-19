---
'octane': patch
---

Remove memo factory and dependency-array allocations from more production
client cache hits, including nested expressions, returned JSX, custom hooks,
plain TypeScript modules, and explicit hook slots. Preserve factory scope,
declaration timing, callback identity, and held-transition rollback/promotion,
and avoid the extra `useCallback` wrapper closure in every runtime.
