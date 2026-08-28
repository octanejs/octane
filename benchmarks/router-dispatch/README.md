# App-core router dispatch benchmark

This Node-only suite measures `@octanejs/app-core` request matching across a
1,000-route table. Each sample exercises one of three semantically gated paths:

- a static route whose match is last in the table;
- a lowercase wrong-method request rejected by every server route; and
- a dynamic parameter route whose match is last in the table.

The harness reports milliseconds per million candidate routes so the two fast
paths can be compared with the unchanged dynamic route path in the same process.
Correctness gates require the exact route identity, empty/static params, a null
method miss, and decoded dynamic params.

Run it through the unified harness:

```bash
node benchmarks/bench.mjs --quick --ratios router-dispatch
```
