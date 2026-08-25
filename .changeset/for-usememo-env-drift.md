---
'octane': patch
---

Invalidate keyed `@for` item memo caches when the parent env tuple drifts, so `useMemo`/`useCallback` factories that close over list captures stay fresh even when explicit deps omit them.
