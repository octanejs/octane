---
'@octanejs/livestore': patch
---

Return each `useStore()` call its own store when one component calls it for
several stores that load at different times. Before, once the first store
loaded, the Suspense replay gave the second call the first store instead of
suspending until its own store loaded. Each call site now keeps reading the
promise it suspended on, so the fallback stays until every store has loaded.
