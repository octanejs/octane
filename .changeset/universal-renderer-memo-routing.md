---
'octane': patch
---

Keep `useMemo` and `useCallback` on a universal renderer's hook runtime in production builds.

The closure-free DOM memo optimization could incorrectly lower hooks inside an owning universal renderer component and import `octane/internal/client`. Universal renderers do not have a DOM component scope, so those helpers either failed to resolve in custom build pipelines or crashed at runtime. Universal components now retain their renderer-specific memo hooks, while DOM components keep the optimized path.
