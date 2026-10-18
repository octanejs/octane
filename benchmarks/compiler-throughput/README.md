# Compiler throughput

Compile equivalent component trees with the real Octane, React, Preact, Solid 2,
Svelte, Vue Vapor, and Inferno production compiler pipelines. Every target must emit
non-empty executable JavaScript before its cold, warm, and one-component-change
timings are recorded. Normal runs measure 10, 100, and 1,000 components; quick
runs measure 10 and 100. Results include p95/p99, compiled bytes, and heap growth.

```bash
node benchmarks/bench.mjs --quick compiler-throughput
node benchmarks/bench.mjs compiler-throughput
```

## Conditional component chains

Compare single-root proof propagation against a selected complete Octane package:

```bash
BENCH_JSON=/tmp/single-root.json node benchmarks/compiler-throughput/single-root.mjs 7 --octane-revision=f665de94cd4d647c3310edd4dd2ac157c737d596
```

This paired runner uses the existing revision snapshot helper, identical dependencies
and public compiler options. Three warmup pairs precede alternating A/B and B/A
samples. Forward and reverse chains from 10 to 5,000 components expose declaration
order sensitivity; a single component and wide independent branches are controls.
Each sample checks the complete compile result, including code, maps and diagnostics.
Additional dev/client/server controls include unsafe branches, cycles and repeated
dependencies. Source, harness and lockfile hashes identify the measured inputs;
source edits during a run fail it.

The reported duration covers whole compilation, not just the proof pass. These
synthetic modules do not establish a general application build improvement or a
runtime speedup. The worklist trades temporary O(V + E) memory for bounded proof
work; this runner does not measure allocation or garbage collection separately.
