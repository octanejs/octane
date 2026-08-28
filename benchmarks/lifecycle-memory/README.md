# Lifecycle and memory soak

This benchmark production-builds Octane, React, Preact, Solid 2, Svelte, Vue
Vapor, and Inferno and repeatedly mounts and unmounts 96 keyed, effectful components in real
Chromium. A normal run performs more than 1,000 complete mount/unmount cycles
per renderer.

Each component owns a real DOM-event listener, external-store subscription, and
interval. Each cycle also updates the mounted rows before teardown. Correctness
fails if an update remounts an effect, an effect is not cleaned up exactly once,
a listener, subscription, or timer remains, an unmounted row stays visible, or a
removed listener still receives a probe event.
Chromium's DevTools protocol explicitly collects garbage and reports used heap;
heap measurements are diagnostics, not a noisy pass/fail proxy for a leak.

```bash
node benchmarks/bench.mjs --quick lifecycle-memory
node benchmarks/bench.mjs lifecycle-memory
```
