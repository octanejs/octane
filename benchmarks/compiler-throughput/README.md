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
