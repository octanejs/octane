# TypeScript text-project root scaling

This Node-only suite measures repeated warm snapshots from Octane's optional
TypeScript text-inference project. The target source and its inferred string
child are identical in both variants; only the number of unrelated configured
roots changes.

The synthetic roots intentionally do not exist. TypeScript still presents them
to the language-service host, which isolates root membership and root-list
bookkeeping without adding parse or bind work to the timed interval. Each sample
times 500 cached production snapshots and reports per-snapshot latency. The
harness checks the inferred child and a cross-variant fact checksum before
sampling, then checks the final fact identity outside the measured interval.

```bash
node benchmarks/bench.mjs --quick --ratios text-type-roots
node benchmarks/bench.mjs text-type-roots
```

`OCTANE_TEXT_TYPE_ROOT=/path/to/checkout` selects the compiler source from a
different checkout while retaining this exact fixture generator and runner for
baseline/candidate comparisons.
