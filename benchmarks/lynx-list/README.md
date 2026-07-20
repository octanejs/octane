# Lynx native-list allocation benchmark

This Node-only suite drives the real Octane Lynx host implementation through a
minimal fake Element PAPI. It scrolls a 12-cell visible window across 1,000
logical, recyclable `<list-item>` rows and records deterministic source-level
diagnostics for physical cell allocation, reuse, and teardown.

The `eager-list-model` target allocates one cell per logical item. The committed
ratio guard requires Octane's physical-cell count to remain at most 2% of that
reference. Semantic text checksums and native identity checks ensure a lower
count cannot come from skipping rows or replacing reuse with stale content.
Teardown must detach every reachable cell and make late native callbacks inert.

```bash
node benchmarks/bench.mjs --quick --ratios lynx-list
```

This is deliberately not a timing, memory, layout, or device-lifecycle claim.
Those behaviors still require the Android and iOS probes described in the Lynx
renderer plan.
