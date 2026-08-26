# Scheduler depth

Production Octane queues state updates deepest-first across a nested component
chain, then flushes them through the public client scheduler. The 500- and
2,000-component cases share the same JIT and alternate measurement order. The
runner uses a larger Node stack because both mounting and rerendering a deeply
nested component tree are synchronous by design.

Every sample verifies that all state owners advanced, the retained leaf kept its
DOM identity, the visible checksum is exact, and shallow-first coalescing rendered
each component once. This isolates scheduler render-wave ordering without using a
private runtime hook.

```bash
node benchmarks/scheduler-depth/run.mjs
node benchmarks/scheduler-depth/evaluate.mjs
```
