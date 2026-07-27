# Event delegation

Real Chromium dispatches 128 native bubbling `InputEvent`s to distinct hosts in a 512-field application. The correctness gate checks native capture, native bubbling, every framework handler, and every resulting controlled input and output. Timings are published with p95/p99 statistics.

```bash
node benchmarks/bench.mjs --quick event-delegation
node benchmarks/bench.mjs event-delegation
```
