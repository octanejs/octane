# Ink cursor-update benchmark

This Node-only suite compares the production `@octanejs/ink` log updater with the exact previous
cursor-only branch. It bundles the real TypeScript source before measurement, drives both standard
and incremental modes through discard-only writable streams, and byte-gates their observable output
before timing.

The representative case performs 80 cursor moves over separately materialized but equal copies of a
fixed 20,000-line, approximately 1 MB frame. Separate stable-frame batches isolate the cursor branch
at 20,000 and 80,000 lines. A 32-line control stays visible, while initial and changed-frame controls
guard against moving split work into other render paths. Instrumented runs outside timing require zero
newline splits for production cursor-only updates, one per update for the previous branch, and one for
initial and changed renders in both implementations.

The runner re-executes Node with exposed garbage collection and a larger young generation. Collection
runs only before timed samples. Initial and changed controls use fine-grained A-B-B-A ordering inside
each sample so their identical split work is compared without order or collection drift.

Run it directly or through the unified runner:

```bash
node benchmarks/ink-cursor-update/run.mjs 3
node benchmarks/ink-cursor-update/run.mjs 8
node benchmarks/bench.mjs --quick --ratios ink-cursor-update
node benchmarks/bench.mjs --ratios ink-cursor-update
```
