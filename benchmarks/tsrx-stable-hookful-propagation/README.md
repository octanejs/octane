# TSRX stable-hookful propagation

This Node-only suite compiles matched stable-hookful component chains in dependent-first and dependency-first declaration order. The leaf publishes one private `useState` setter and captures one live import, so the compiler must propagate both facts through the full same-module chain. Every wrapper owns an immediate host root so the timed pair isolates stable-hookful propagation from the compiler's separate transitive root-shape analyses.

The high-cardinality pair exposes declaration-order rescans. The ordinary pair prevents a large-graph win from hiding a common-size regression; each ordinary sample averages ten compiles so scheduler granularity does not dominate its roughly 5 ms latency. Bounded semantic controls cover a missing dependency, a safe cycle, repeated child edges, transitive capture/publication propagation, and the 16-publication eligibility boundary.

The accepted seven-iteration comparison against clean pinned main `babf8d7b8f4aca11456989ee14722c3bc58ae861` passed the 10% score-RME ceiling on its first balanced A-B-B-A attempt. Every target retained byte-identical output across checkouts:

| Checkout | Order / size | Score | Score RME | Minimum |
| --- | --- | ---: | ---: | ---: |
| pinned main | dependent-first / 1,000 | 223.471 ms | 7.158% | 191.691 ms |
| pinned main | dependency-first / 1,000 | 125.238 ms | 7.412% | 108.832 ms |
| candidate | dependent-first / 1,000 | 149.041 ms | 6.836% | 125.478 ms |
| candidate | dependency-first / 1,000 | 123.777 ms | 5.658% | 109.123 ms |

The dependent-first headline improved by 33.3%. Its conservative confidence-bound improvement was 48.244 ms and 1.303x, clearing both retained materiality floors. Candidate declaration-order cost was 1.204x, below the 1.25 ceiling. Both 40-component score and minimum ratios were below 1.0, so the ordinary-size non-regression gate also passed.

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

The comparator balances process order, rejects a dirty or wrong-revision reference checkout, requires byte-equivalent output hashes and passing semantic controls, and fails unless the candidate has a conservative 20% or 25 ms high-cardinality win, stays within a 1.25× declaration-order ratio, and keeps both ordinary targets within 10% of main. The shared benchmark runner also retains same-process declaration-order and per-component scaling guards.
