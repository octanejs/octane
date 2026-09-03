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

## Scale-bound Native fixture

`app/src/App.lynx.tsrx` is also the source for the real Native diagnostic
fixture. It renders logical rows through Lynx `list`/`list-item`; the build
script accepts only the exact 1k and 10k scales and writes a distinct artifact
for each. The literal logical-row declaration is staged into the build rather
than selected at runtime, so artifact bytes and scale cannot drift apart.

```bash
BENCH_LIST_ROWS=1000 pnpm --dir benchmarks/lynx-list build:app
BENCH_LIST_ROWS=10000 pnpm --dir benchmarks/lynx-list build:app
node --test benchmarks/lynx-list/*.test.mjs
```

The fixture test pins stable keys, the 390×640 viewport, 40 px row estimate,
two leading/trailing buffer rows, exact per-scale output paths, and the
startup/recycle/fling semantic contract. It does not claim real Android
allocation by itself. That claim requires the benchmark repository's versioned
Native observer, method revision, measured overhead, and fresh device campaign;
without those, allocation is reported as not measured.
