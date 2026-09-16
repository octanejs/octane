# Empty descriptor children

This production Chromium workload renders 128 and 512 keyed descriptor hosts,
including all five empty child values: `null`, `undefined`, `false`, `true`, and
`''`. Text-only and nested nonempty children are controls where the empty-host
optimization should disappear. Each case checks output, host and child identity,
updated props, live native events, balanced refs, and complete unmount.

```sh
EMPTY_HOST_RUNTIME=/path/to/frozen/runtime.ts BENCH_JSON=/tmp/empty-before.json \
  node benchmarks/empty-host-children/run.mjs
BENCH_JSON=/tmp/empty-after.json node benchmarks/empty-host-children/run.mjs
node benchmarks/bench.mjs --ratios empty-host-children

# Optional clean production timing: 200 warmups, 15 samples of 100 updates.
EMPTY_HOST_TIMING=1 BENCH_JSON=/tmp/empty-timing.json \
  node benchmarks/empty-host-children/run.mjs
```

The source override changes only `runtime.ts`; the compiler, dependencies, and
remaining source graph come from this checkout. Record the source commit along
with the runtime, runner, and bundle hashes included in the JSON.

A separate parsed bundle counts executed array expressions inside the actual
child reconciler, restricted to the fixture's `i` hosts. The benchmark requires
the observed and clean versions to produce identical semantic snapshots. These
counts describe source work, not measured heap bytes or a promise that every
array survives optimizing compilation. Timings use the untouched minified
production bundle and never the observer. They include descriptor creation,
root transactions, attribute updates, and DOM work; they do not isolate the
empty-child check, layout, paint, or GC.

## Contract

An empty scalar child on an already empty host needs no namespace resolution,
flattened item/key arrays, or ownership scan. Existing children still enter the
full reconciler: owned children must be removed, foreign nodes preserved, and
held changes restored when a later sibling suspends. Array-valued children stay
on the general path, preserving their indexed reads and key handling.

The focused regression covers empty-to-populated-to-empty transitions, foreign
DOM, ref cleanup, hydration adoption, following siblings, edited input values,
and rollback/retry in both runtime compile modes.

## Recorded comparison

Frozen baseline: `733c98d57b76fcfbc8f1272cc1e202582f4bedfd`. Node 26.4.0,
Chromium 149.0.7827.55, macOS arm64, identical dependencies and source graph
apart from the selected client runtime.

| Child shape | Hosts | Mount array expressions, before → after | Update/unchanged, before → after |
| --- | ---: | ---: | ---: |
| Empty | 128 | 256 → 0 | 256 → 0 |
| Empty | 512 | 1,024 → 0 | 1,024 → 0 |
| Text | 128 | 256 → 256 | 0 → 0 |
| Text | 512 | 1,024 → 1,024 | 0 → 0 |
| Nested | 128 | 256 → 256 | 640 → 640 |
| Nested | 512 | 1,024 → 1,024 | 2,560 → 2,560 |

The existing text update return precedes the new guard, so that hot path pays
no additional empty-child check. Text and nested controls retain all their
previous array-expression work. The selected clean production bundle includes
both the empty-host guard and the accompanying passive-callback hoist; their
combined change grows this entry by 67 minified / 12 gzip bytes. These bytes
are not attributed to the empty-host guard alone. There is no new retained
state in the empty-host change.

Four alternating baseline/candidate pairs use fresh browser processes. Times
below are milliseconds per update of all hosts, median of the four process
medians; brackets show their range.

| Shape / hosts | Baseline | Candidate |
| --- | ---: | ---: |
| Empty / 128 | 0.0825 [0.075, 0.105] | 0.0825 [0.067, 0.089] |
| Empty / 512 | 0.3185 [0.294, 0.394] | 0.3245 [0.267, 0.347] |
| Text / 128 | 0.0955 [0.094, 0.121] | 0.0985 [0.094, 0.105] |
| Text / 512 | 0.3990 [0.373, 0.456] | 0.3995 [0.331, 0.422] |
| Nested / 128 | 0.1630 [0.146, 0.204] | 0.1690 [0.139, 0.180] |
| Nested / 512 | 0.6630 [0.644, 0.826] | 0.6910 [0.565, 0.791] |

These distributions overlap; they establish no latency improvement or
regression. The retained benefit is removal of the two executed array
expressions per empty host. The control workloads confirm that the proposed
benefit disappears when children need actual reconciliation. Raw samples,
source/runner/bundle hashes, work counts, and semantic snapshots are retained in
[results.json](./results.json). Other engines, layout/paint, startup, and total
heap/GC effects were not measured.

Final deterministic guard verification used the formatted runtime with source
SHA-256 `bd66924940fc3bb94ccdf1f3cb0fdffe2bc2c49a20d2e90db99920148ad1f471`.
Its clean bundle SHA-256 is
`4ff98be2ecb61efc77cf43a37bd9d73d3a05fb7bc03ea8871a570e1c39d9127d`, matching
every timed candidate bundle above, at 177,944 minified / 56,139 gzip bytes.
The final verification metadata is included in [results.json](./results.json).

## Regression proof

The new three behavioral cases pass in development and production (six
executions). Deliberately removing the empty-DOM condition from the early return
makes all six fail: the ordinary and hydrated hosts retain their previous
`strong` child, and the suspended retry retains its input. Restoring the
condition restores the required clearing behavior. The mutation was removed
before validation of the final source. The new cases and neighboring descriptor
cursor, classification, child-key, and pure-host upgrade suites then pass all
136 development/production executions.
