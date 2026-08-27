# Streaming SSR backpressure

Drive real production-built Octane, React, Preact, Solid 2, and Inferno streaming server
renderers into a Node `Writable` with a one-byte `highWaterMark` and delayed
write callbacks. Verify that every renderer experiences actual backpressure,
eventually streams the complete ten-boundary page, and can serve three
independent slow destinations concurrently. Renderers exposing a public abort
handle are also cancelled immediately after their shell; Inferno's public queue
stream does not expose an abort handle, so the abort metric is N/A for that row.

Vue Vapor and Svelte are explicitly not fabricated as streaming references:
their public server renderers do not expose the same pipeable-stream contract.

```bash
node benchmarks/bench.mjs --quick streaming-backpressure
node benchmarks/bench.mjs streaming-backpressure
```
