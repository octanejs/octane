# Development form diagnostics

This Node/jsdom suite measures development commits that update large batches of
controlled text inputs. Each host carries the same source marker emitted by the
development compiler and is read-only, so the measurement includes diagnostic
queueing and draining without spending time printing warnings.

The ratio guard compares time per 1,000 hosts at 32,000 inputs against 4,000
inputs. A linear queue stays roughly flat per host; a whole-queue membership scan
for every host grows with the batch.

```bash
node benchmarks/bench.mjs --quick --ratios dev-form-diagnostics
node benchmarks/bench.mjs dev-form-diagnostics
```
