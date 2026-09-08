# Rspack CSS-module graph benchmark

This Node-only suite runs the production CSS-module constants controller through
its public compiler hooks with zero, one, and sixteen exact ESM requests. It
counts public `moduleGraph.getOutgoingConnections()` traversals and yielded
connections while semantic gates require every safe target to reach the provider
and every proof request to be consumed.

The sixteen-request fixture previously performed 48 graph traversals and 768
connection visits through collection, post-rebuild verification, and seal. The
batched resolver performs three traversals and 48 visits. A same-run ratio guard
compares its traversal count with the one-request control, while exact assertions
also protect the zero-request path and early termination after all requested
targets become invalid.

Run the suite through the unified harness:

```bash
node benchmarks/bench.mjs --quick --ratios rspack-css-graph
```
