# External-store fan-out

This benchmark connects 512 independently rendered subscribers to the same
observable external store in production-built Octane, React, Preact, Solid 2,
Svelte, and Vue Vapor applications.

Octane, React, and Preact use `useSyncExternalStore`; the signal-based renderers
use their native lifecycle and reactive primitives. Real Chromium verifies that
a narrow write changes only its intended visible subscriber, a broad write
updates all 512 subscribers consistently, rapid consecutive writes do not tear,
and teardown removes every store listener exactly once. Snapshot calls,
notifications, subscriber renders, and subscription cleanup are published as
diagnostics alongside timing.

```bash
node benchmarks/bench.mjs --quick external-store-fanout
node benchmarks/bench.mjs external-store-fanout
```
