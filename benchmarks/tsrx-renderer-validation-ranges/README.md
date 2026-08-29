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
node benchmarks/tsrx-renderer-validation-ranges/run.mjs 7
node benchmarks/tsrx-renderer-validation-ranges/compare.mjs \
  /path/to/baseline /path/to/candidate 7
```

The cross-checkout comparator uses conservative 95% score bounds. It requires
the focused high-cardinality workload to improve by at least 2x and 25 ms, the
production-pipeline workload to improve by at least 20%, and both low-cardinality
controls to stay within 10% of baseline. An identical-checkout comparison fails
closed.
