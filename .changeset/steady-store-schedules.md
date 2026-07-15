---
'octane': patch
---

Bound recursive effect setup/cleanup, ref, root-render, and external-store update chains with recoverable maximum-depth errors while preserving finite chains and wide independent batches. Keep `act()` scopes balanced when a synchronous drain rejects, report cross-component render updates in development, and preserve the implicit bailout when a compiled component returns unchanged `children`.
