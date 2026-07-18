---
'@octanejs/app-core': patch
---

Initialize deferred-hydration interaction capture before generated client
entries begin asynchronous route loading, preserving input that arrives before
`hydrateRoot()`.
