---
'octane': minor
---

Count engine work in profile builds.

Profile builds now keep session totals of the work around component renders:
render attempts and their outcomes, bailouts, Blocks created and torn down,
`@if`/`@switch` arms kept or replaced, Suspense fallbacks and error catches,
render-queue passes, root commits, and work discarded by rollbacks. Read them
with `profiler.counters()`, or take `profiler.snapshot()` before and after an
interaction and pass both to `profiler.diff()`. Snapshots carry a schema
version, build, renderer set, and recording generation; `diff()` rejects pairs
it cannot compare. A counter the installed renderer does not record is absent
rather than zero.

Builds without `profile` contain none of this code once optimized; unminified
development output keeps the disabled branches as dead code.
