# Hydration range compaction

This Node/jsdom suite renders and hydrates a production-built Octane component
chain whose wrappers all adopt the same interactive leaf. The 64- and
512-wrapper cases share one process and alternate measurement order. The
reported `hydrate_per_100_wrappers` metric exposes repeated post-hydration range
bookkeeping without mixing server rendering, HTML parsing, interaction, or
unmount into the timed interval.

Every sample verifies that hydration keeps the server-created button, preserves
the logical hydration-marker multiplicity while compacting physical pairs,
handles a real delegated click, and removes the complete tree on unmount.

```bash
node benchmarks/hydration-range-compaction/run.mjs
node benchmarks/bench.mjs --quick hydration-range-compaction
```
