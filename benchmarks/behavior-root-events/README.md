# Behavior-root event queue benchmark

This headless-Chromium suite measures a supported late-behavior path that ordinary
synchronous queue drains do not exercise: one queued native event per distinct
element, with every element's asynchronous adoption settling separately.

The 1,000- and 8,000-event batches run in the same production browser and
page, alternate measurement order, and report `resume_per_1000_events`.
Correctness gates require every original `CustomEvent` to reach its matching
element exactly once and in FIFO order. The same-run ratio guard keeps normalized
resume cost flat as the queue grows, catching both repeated prefix compaction and
repeated whole-adoption scans.

Run it through the unified harness:

```bash
node benchmarks/bench.mjs --quick --ratios behavior-root-events
```
