# Scheduler responsiveness

Production Chromium drives controlled typing while 512 external-store subscribers receive eight overlapping broad updates under 6× CPU throttling. Every framework must preserve the exact draft, focus, caret, subscriber output, and every notification. The suite publishes input-to-completion latency, p95/p99, animation-frame gaps, and update counts.

```bash
node benchmarks/bench.mjs --quick scheduler-responsiveness
node benchmarks/bench.mjs scheduler-responsiveness
```

## Direct buffered transport readers

```bash
node benchmarks/scheduler-responsiveness/reader-backlog.mjs
node benchmarks/scheduler-responsiveness/reader-backlog.mjs /path/to/base --report
```

This production-runtime probe consumes 32 ready RPC values directly, bypassing
signal/render coalescing, and releases a custom-renderer delivery backlog whose
first acknowledgement was held. Each value costs 2 ms of synthetic consumer work.
Every value remains ordered. The report includes progress before a marker task,
marker latency, and total completion; it does not measure browser input or paint.
The same shared budget covers partial transport reads, complete frame parsing,
and optional response-reader delivery admission. Inline document delivery keeps
its existing path, and one receiver's later asynchronous continuation is outside
this admission boundary.
