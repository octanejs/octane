# TSRX renderer-validation ranges

Measure authored-range membership through two semantic workloads:

- `focused-*` lowers one tiny universal renderer region while validating a
  pre-parsed authored AST with 32 or 3,200 independent selected ranges. This
  isolates the cost of deciding whether authored AST nodes belong to a renderer.
- `pipeline-*` compiles 100 or 1,600 independent local components referenced by
  one ordinary renderer boundary. The compiler discovers the validation ranges
  through its production boundary pipeline. Matched reference targets omit only
  the child renderer's validation policy, so their timing difference estimates
  validation's share of whole-compilation time.

Every timed sample must keep its semantic checksum. Validated and reference
pipeline targets must also emit byte-identical output. Measurement order reverses
on alternating iterations.

```bash
node benchmarks/bench.mjs --quick --ratios tsrx-renderer-validation-ranges
node benchmarks/bench.mjs --record tsrx-renderer-validation-ranges
node benchmarks/tsrx-renderer-validation-ranges/run.mjs 7
node benchmarks/tsrx-renderer-validation-ranges/compare.mjs \
  /path/to/baseline /path/to/candidate 15
```

The cross-checkout comparator uses conservative 95% timing bounds. It requires
the focused high-cardinality workload to improve by at least 2x and 25 ms, the
production-pipeline compile time to improve by at least 20%, and both
low-cardinality controls to stay within 10% of baseline without a statistically
significant regression. It also reports the conservative change in validation
overhead relative to the matched whole-compile reference for attribution, but
that noisier derived metric is not a second retention gate. An identical-checkout
comparison fails closed.

The committed same-process guards are deliberately narrower than those
cross-checkout claims. Normalized focused cost may grow by at most 1.5x from 32
to 3,200 selected ranges, and validated whole-pipeline compilation may cost at
most 1.3x its matched no-validation reference. These pairwise guards retain
timing headroom while catching restoration of the range-by-node scan.
