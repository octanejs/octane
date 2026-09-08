# TSRX local-component name catalog

Measure renderer-boundary preparation while holding 1,000 sibling boundaries
constant and varying unrelated local components from 1,000 to 10,000. The fixture
passes a reused parser AST, matching the public compiler's preparation call.
Every target verifies boundary and universal-unit counts before timing.

```bash
node benchmarks/bench.mjs --quick --ratios tsrx-local-component-name-catalog
node benchmarks/bench.mjs --record tsrx-local-component-name-catalog
node benchmarks/tsrx-local-component-name-catalog/run.mjs 9
node benchmarks/tsrx-local-component-name-catalog/compare.mjs \
  /path/to/baseline /path/to/candidate 9
```

The same-process ratio guard retains the cost of collecting the component Map
once but rejects copying all 10,000 names for every boundary. The comparator loads
exact baseline and candidate compilers together, checks byte-identical public
output on a bounded control, alternates execution order, and requires at least a
10% and 50 ms win at the conservative 20th percentile of paired high-cardinality
samples. The ordinary-size control may not regress by more than 10% at its
conservative paired percentile.
