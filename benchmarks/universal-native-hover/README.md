# Native universal hover updates

This Node-only suite follows issue #1007's small native renderer workload:
20 rows, four component and `view` layers around each row, and 2,000 hover
events that select successive rows. It compiles JSX in production mode for the
public `octane/universal/native` renderer and uses the public object host driver.
An 80-row variant checks the cost of increasing the same component depth and
number of hosts fourfold.

The reporter's [Hermes reproduction](https://github.com/Josema/octane-and-solid-core-memory-reproduction)
uses hand-authored universal plans and an empty-dependency effect in each view.
Use that harness when investigating the issue's cumulative allocation, mounted
heap, and garbage collection; this compiled Node suite exercises a different
render path and has no view effects.

Each sample keeps the tree mounted, dispatches 2,000 native host events, and
flushes the resulting state update. The harness verifies the original 101 or
401 host identities, four view layers per row, correct selected props, exactly
two changed row props on a separate event, and complete host teardown. It
clears the object driver's diagnostic `commits` history after every event;
otherwise that history retains every accepted host batch and can look like a
renderer memory leak. Mount, validation, and teardown are outside timed samples.

```bash
node benchmarks/universal-native-hover/run.mjs 7
node benchmarks/bench.mjs --quick --ratios universal-native-hover
```

To compare immutable production builds without rebuilding the current source,
copy the complete `packages/octane/dist` directory into a package root that
provides the same `package.json` imports, parser source, and `node_modules`,
then supply its path:

```bash
BENCH_OCTANE_DIST=/absolute/path/to/old-package/dist node benchmarks/universal-native-hover/run.mjs 7
```

For a local **cumulative allocation diagnostic**, write a V8 Inspector
sampling profile. The 2 KiB sampler includes objects collected by both minor
and major GC, so its sum estimates allocated bytes during the first warmed
20-row, 2,000-hover sample. It also prints the largest allocation stacks. A
profiled timing sample is distorted by instrumentation; compare normal runs
for latency, and use the same Node version, sampling options, and host for
allocation comparisons. The profile is local and may be large.

```bash
BENCH_ALLOCATION_JSON=/private/tmp/native-hover-allocation.json \
  node benchmarks/universal-native-hover/run.mjs 1
```

The ratio guard permits at most twice linear growth from 20 to 80 rows. This
checks scaling on the same machine and run; it cannot prove a reduction in
constant cost. The object driver's transactional simulation is part of the
measured public host path. Node/V8 sampling cannot reproduce Hermes's exact
garbage collector, allocation accounting, native GPU work, or event transport.
