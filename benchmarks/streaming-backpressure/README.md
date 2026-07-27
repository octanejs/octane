# Streaming SSR backpressure

Drive real production-built Octane, React, Preact, and Solid 2 streaming server
renderers into a Node `Writable` with a one-byte `highWaterMark` and delayed
write callbacks. Verify that every renderer experiences actual backpressure,
eventually streams the complete ten-boundary page, and can serve three
independent slow destinations concurrently. Renderers exposing a public abort
handle are also cancelled immediately after their shell.

Vue Vapor and Svelte are explicitly not fabricated as streaming references:
their public server renderers do not expose the same pipeable-stream contract.

```bash
node benchmarks/bench.mjs --quick streaming-backpressure
node benchmarks/bench.mjs streaming-backpressure
```
