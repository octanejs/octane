# TSRX void memo alias classification

This Node-only suite isolates the production bundler classifier that proves
which compiled TSRX component exports return through Octane's void-component
contract. Each fixture wraps one direct void component in an exact local
`const Alias = memo(Target)` chain.

The suite measures 250- and 1,000-alias chains in both declaration orders.
Dependent-first sources declare the exported outer alias before its target;
dependency-first sources reverse the same declarations. Timed samples reuse a
parsed authored AST so parser work cannot hide declaration-order-dependent
closure propagation. Every sample requires exactly the exported `Memo0` alias,
and untimed controls keep comparators, non-Octane callees, and mutable bindings
unproven.

```bash
node benchmarks/bench.mjs --quick --ratios tsrx-void-memo-aliases
node benchmarks/bench.mjs tsrx-void-memo-aliases
```

`OCTANE_VOID_MEMO_ROOT=/path/to/checkout` selects another compiler checkout for
an A/B run while retaining this harness and fixture generator.
