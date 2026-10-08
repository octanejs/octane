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

## Buffered-work browser coverage

```bash
pnpm exec vitest run --project octane-events-browser packages/octane/tests/browser/scheduler-backlogs/scheduler-backlogs.test.ts --silent=false
node benchmarks/scheduler-responsiveness/browser-backlogs.mjs
node benchmarks/scheduler-responsiveness/browser-backlogs.mjs /path/to/base --quick
```

The browser runner builds minified production fixtures and uses Chromium under
6× CPU throttling. The first trusted keystroke releases 100 ready query values,
100 derived values, 100 ready Actions, or a shared module for 60 independent
islands. Query/derived subscriptions and island activations each add 2 ms of
synthetic CPU work. Islands adopt real server-rendered buttons; their retained
node identity and live handlers are checked. Controlled input must preserve its
draft, focus, and caret, and every value/Action must execute in order.

Event Timing is installed before the application. Reports take the maximum
duration per nonzero interaction ID and retain Chromium's 16 ms observation floor:
an empty sample is `null`, not zero latency. This is a distribution of the driven
interactions, not a page-level INP score. Completion runs from backlog release
through both source completion and the final DOM commit. The CLI excludes one
warmup and records five samples (`--quick` records one); a baseline source path
builds the same fixture against that checkout. React runs the equivalent Action
and controlled-input case; Octane-specific signals/islands have no artificial
React analogue.

CI gates ordered work, final UI, and later trusted input before the deliberately
prolonged stream/island workload is exhausted. A fast coalesced Action may finish
before a second key, so that case reports overlap without requiring it. Latency
and total completion are reported without fragile absolute timing thresholds.
The component fixtures exercise public APIs with explicit compiler hook slots
and the native reader ABI; this suite does not measure compiler output quality,
network loading, or input replay inside a still-inactive island. CI retains
`benchmarks/results/scheduler-backlogs.json` in the browser work-results artifact.
