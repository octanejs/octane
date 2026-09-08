# Visx categorical-scale benchmark

This Node-only suite measures repeated categorical-domain lookups through the
production `@octanejs/visx` lookup helper and the prior `Array#indexOf` path.
Each measured build includes index construction and one complete-domain pass;
every sample repeats that whole unit.

The 16-key control stays on the production helper's linear path. A 64-key case
pins the measured crossover where building the index starts to amortize within
one complete-domain pass. The 4,096-key case exposes the repeated whole-domain
scan that appears when a chart assigns a color to every datum. Every timed
sample includes repeated index construction. Correctness gates require
identical checksums, first-match duplicate handling, and the same missing-key
sentinel before timings are accepted.

Run it through the unified harness:

```bash
node benchmarks/bench.mjs --quick --ratios visx-categorical-scale
```
