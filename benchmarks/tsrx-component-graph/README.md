# TSrX component graph compilation

This Node-only suite compiles matched 2,400-component production TSrX graphs in
two declaration orders. Every component wraps the next component. One graph's
leaf reads a live import, so the compiler must carry that import witness through
all 2,399 same-module call edges so automatic memoization cannot hide a later
live binding update. The other graph's leaf renders an imported component, so
all 2,400 same-module components must retain a fetch-tree warm plan.

Small untimed controls also require a closed synchronous cycle to emit no warm
plan and a cycle that reaches an opaque component to keep both reachable plans.

`dependent-first` declares the exported root before its dependencies. A graph
analysis should not care about that ordinary function-hoisting choice.
`dependency-first` declares the leaf first and is the same-machine reference.
The live-import variants require zero diagnostics and exactly 2,399 emitted
live-binding witnesses before their samples count. The opaque-leaf variants
require zero diagnostics and exactly 2,400 emitted warm plans. These semantic
checks prevent faster timings obtained by dropping graph propagation work.

The declaration orders also pin the compiler's component-hoisting decision.
`dependent-first` has 2,399 real references above their declarations, while
`dependency-first` has none. The harness verifies both counts so the compiler
can index those references once without changing module-evaluation semantics.

```bash
node benchmarks/bench.mjs --quick --ratios tsrx-component-graph
node benchmarks/bench.mjs tsrx-component-graph
```

The ratio guards allow timing noise but reject whole-module fixed-point rescans,
whose work grows with both component count and dependency depth. The opaque-leaf
pair specifically protects fetch-tree warm reachability from declaration-order
dependent rescans.
`OCTANE_GRAPH_ROOT=/path/to/checkout` selects a different compiler checkout for
an A/B run while retaining this exact harness and fixture generator.
