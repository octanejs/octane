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

`--simulated-view-transition` repeats the same workload with a native API test
double whose update callback runs in a host task. It checks prompt pending cues
and a single capture for all ready results, including a gated backlog. This is
controller/task-order evidence; it does not simulate browser snapshots or paint.

```bash
node benchmarks/scheduler-responsiveness/action-backlog.mjs --simulated-view-transition
```

## Ready signal backlogs

```bash
node benchmarks/scheduler-responsiveness/signal-backlog.mjs
node benchmarks/scheduler-responsiveness/signal-backlog.mjs /path/to/base --report
```

This production, minified-runtime jsdom probe checks query and asynchronous
derived streams with 100 ready values, both without extra subscriber work and
with 2 ms per publication. It also measures 12 concurrent query producers. Every
ordered publication and final DOM value must survive. The report includes native
component commits, progress before a marker task, marker latency, and total
completion time. Direct signal binding writes are outside the commit count.

The shared budget creates task opportunities between indivisible units. One slow
subscriber or render can exceed its approximately 5 ms window. Concurrent roots
can commit more often as work is paced, so assess completion time together with
responsiveness. These measurements do not establish browser input or paint
latency.
