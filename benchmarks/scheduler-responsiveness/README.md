# Scheduler responsiveness

Production Chromium drives controlled typing while 512 external-store subscribers receive eight overlapping broad updates under 6× CPU throttling. Every framework must preserve the exact draft, focus, caret, subscriber output, and every notification. The suite publishes input-to-completion latency, p95/p99, animation-frame gaps, and update counts.

```bash
node benchmarks/bench.mjs --quick scheduler-responsiveness
node benchmarks/bench.mjs scheduler-responsiveness
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
