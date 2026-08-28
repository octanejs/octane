# Floating tree navigation benchmark

This Node-only suite exercises the private `@octanejs/floating-ui` helper that routes virtual
keyboard navigation to the deepest open floating node. It compares the production helper with the
exact previous algorithm on a deep chain, an equal-depth fork, and a root-only control.

Every target must return the same node object as the previous algorithm. A proxy around the input
array counts actual indexed node reads by each implementation, providing deterministic scaling
evidence without adding profiling branches to production code. Timings warm both implementations
and alternate their order across samples; deterministic work is the primary regression signal.

At the full 16-node chain size used by the ratio guard, the previous algorithm performs 1,048,576
indexed node reads while the production helper performs 32. The root-only control remains two reads
for both implementations.

Run the suite through the unified runner:

```bash
node benchmarks/bench.mjs --quick --ratios floating-tree-navigation
node benchmarks/bench.mjs --ratios floating-tree-navigation
```
