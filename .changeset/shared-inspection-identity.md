---
'octane': patch
---

The devtools bridge and the profiler now share one persistent instance-identity registry: devtools tree-node ids equal `ProfileEvent.instanceId`, so a profiler event row resolves directly through `__OCTANE_DEVTOOLS__.inspect()` / `getDomNodes()`. Identity survives `profiler.clear()` (which now resets recorded data only), stale reverse-lookup entries are reclaimed by garbage collection instead of periodic pruning, and `useDebugValue` bookkeeping is skipped entirely until the first debug value is recorded.
