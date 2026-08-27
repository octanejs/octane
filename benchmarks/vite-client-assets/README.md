# Vite client-asset graph benchmark

This Node-only suite measures the production Vite integration's route-to-asset
map over many route entries that converge on one shared manifest graph. The
shared graph is 500 chunks deep and contributes one CSS file, matching the
expensive case where repeated traversal produces almost no additional output.

The 100-route and 1,000-route targets exercise the same graph. Their ratio
guards the graph walk: mapping ten times as many routes should mostly pay for
the larger result object, not walk all 500 shared chunks ten times. A 1,000-route
one-chunk target is the control where sharing has no meaningful traversal to
remove.

Every target verifies the JavaScript entry and ordered CSS list for every route
before timing.

```bash
node benchmarks/bench.mjs --quick --ratios vite-client-assets
node benchmarks/bench.mjs --record vite-client-assets
```
