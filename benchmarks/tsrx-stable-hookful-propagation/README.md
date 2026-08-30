# TSRX stable-hookful propagation

This Node-only suite compiles matched stable-hookful component chains in dependent-first and dependency-first declaration order. The leaf publishes one private `useState` setter and captures one live import, so the compiler must propagate both facts through the full same-module chain.

The high-cardinality pair exposes declaration-order rescans. The ordinary pair prevents a large-graph win from hiding a common-size regression. Bounded semantic controls cover a missing dependency, a safe cycle, repeated child edges, transitive capture/publication propagation, and the 16-publication eligibility boundary.

Run the suite directly:

```bash
node benchmarks/tsrx-stable-hookful-propagation/run.mjs 7
```

Compare a clean pinned main checkout with the current candidate:

```bash
node benchmarks/tsrx-stable-hookful-propagation/compare.mjs \
	--reference-root=/path/to/main \
	--reference-revision=<full-main-sha> \
	--candidate-root=. \
	--iterations=7
```

The comparator balances process order, rejects a dirty or wrong-revision reference checkout, requires byte-equivalent output hashes and passing semantic controls, and fails unless the candidate has a conservative 20% or 25 ms high-cardinality win, stays within a 1.25× declaration-order ratio, and keeps both ordinary targets within 10% of main.
