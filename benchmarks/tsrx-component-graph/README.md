# TSrX component graph compilation

This Node-only suite compiles the same 2,400-component production TSrX graph in
two declaration orders. Every component wraps the next component, and the leaf
reads one live import. The compiler must carry that import witness through all
2,399 same-module call edges so automatic memoization cannot hide a later live
binding update.

`dependent-first` declares the exported root before its dependencies. A graph
analysis should not care about that ordinary function-hoisting choice.
`dependency-first` declares the leaf first and is the same-machine reference.
Both variants require zero diagnostics and exactly 2,399 emitted live-binding
witnesses before their samples count.

```bash
node benchmarks/bench.mjs --quick --ratios tsrx-component-graph
node benchmarks/bench.mjs tsrx-component-graph
```

The ratio guard allows timing noise but rejects a return to whole-module fixed
point rescans, whose work grows with both component count and dependency depth.
`OCTANE_GRAPH_ROOT=/path/to/checkout` selects a different compiler checkout for
an A/B run while retaining this exact harness and fixture generator.
