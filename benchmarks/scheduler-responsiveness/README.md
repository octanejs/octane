# Scheduler responsiveness

Production Chromium drives controlled typing while 512 external-store subscribers receive eight overlapping broad updates under 6× CPU throttling. Every framework must preserve the exact draft, focus, caret, subscriber output, and every notification. The suite publishes input-to-completion latency, p95/p99, animation-frame gaps, and update counts.

```bash
node benchmarks/bench.mjs --quick scheduler-responsiveness
node benchmarks/bench.mjs scheduler-responsiveness
```

## Ready Action backlogs

`node benchmarks/scheduler-responsiveness/action-backlog.mjs` runs a deterministic
production-runtime probe in jsdom. It checks 100 ready Actions and a gated first
Action followed by a ready backlog. Every Action must execute in order with the
previous result; result rendering must wait behind a marker task and coalesce.
The ready burst allows the initial pending commit before that marker. The gated
case measures only after opening its first Action's gate.

Pass another checkout path and `--report` to measure a baseline without applying
the candidate's render-count bounds:

```bash
node benchmarks/scheduler-responsiveness/action-backlog.mjs /path/to/base --report
```

These counters establish task ordering and avoided commits. They do not measure
paint or input latency; use the Chromium suite above for those claims.
