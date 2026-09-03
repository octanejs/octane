# Transition bookkeeping

This suite production-builds a small stateful component, then drives completed
synchronous updates in headless Chromium. Each cycle issues an update, flushes,
crosses one microtask, and flushes again. Five scenarios cover an ordinary urgent
update, one transition owner, nested starts from the same owner, two distinct
nested owners, and two state updates in one transition.

An untimed initial probe checks pending publication for every transition owner
and confirms that the urgent control stays out of pending. Every sample checks
the final value, all owners settling out of pending, one
value-dependent layout commit per cycle, retained host identity, and balanced
layout cleanup. Unmount must remove the output and the final effect. These are
also the semantic gates for the separately counted work.

```bash
node benchmarks/bench.mjs --quick --ratios transition-bookkeeping
node benchmarks/transition-bookkeeping/run.mjs 40
OCTANE_TRANSITION_BASELINE=bf860be9ad6308f1bcece9ce97d5189a7a7b1554 \
  BENCH_JSON=/tmp/transition-comparison.json \
  node benchmarks/transition-bookkeeping/run.mjs 40
```

`OCTANE_TRANSITION_BASELINE` reads only `packages/octane/src/runtime.ts` from the
given Git revision. The compiler, other source modules, dependencies, fixture,
and build settings are shared with the current checkout. This isolates a
runtime-only change; it is not a whole-revision benchmark. Each result includes
the runtime source hash and minified bundle bytes.

Timing uses unchanged minified production bundles, 1,000 warmup cycles, and 500
cycles per sample. Version and scenario order alternate between samples. The
normal run takes 40 samples; quick mode takes three. Raw samples accompany the
shared benchmark statistics. Timing is diagnostic, without a timing ratio gate.
The urgent scenario is the control where transition bookkeeping should have no
benefit. The two-owner scenario still needs a collection of owners.

Set `OCTANE_TRANSITION_SAMPLE_CYCLES=10000` to measure longer intervals when the
default 500-cycle samples are close to the browser timer's resolution. This
positive-integer option changes only cycles per timed sample; the warmup,
untimed work census, and semantic gates are unchanged.

After timing, an untimed pass counts every `Set` construction and `Map.get` in
100 more cycles by temporarily wrapping the native operations. Mount and warmup
are outside that pass, so persistent hook bookkeeping allocated at mount is
excluded. Counts cover the whole completed workload, including the scheduler;
they are constructor and call counts, not retained heap or allocated-byte
measurements. No runtime source probes or private field names are used.
`OCTANE_TRANSITION_WORK_ONLY=1` skips timings while retaining warmup, counters,
and all semantic gates.

The committed ratio guards compare current counts with the explicit work budget
emitted by the harness. Lower-cost implementations may pass with fewer calls;
the guards do not prescribe a particular data structure. Refresh a count budget
only with measured evidence and an explanation of the extra work.

On Node 26.4.0, Chromium 149.0.7827.55, and esbuild 0.28.1, the baseline above
and the optimized runtime produced these deterministic counts per cycle:

| scenario | baseline Sets | current Sets | baseline Map.get | current Map.get |
| --- | ---: | ---: | ---: | ---: |
| urgent | 0 | 0 | 7 | 7 |
| single owner | 1 | 0 | 15 | 14 |
| repeated owner | 1 | 0 | 15 | 14 |
| two owners | 1 | 1 | 19 | 18 |
| two updates | 1 | 0 | 18 | 16 |

The single-owner path removes one constructed set per batch and one lookup per
staged state update. The two-owner control retains its one collection, and the
urgent control is unchanged. The combined fixture's minified production bundle
grew from 172,845 to 173,063 bytes (+218 bytes).

Two initial independent quiet runs on an Apple M5 Max (Darwin 25.6.0) did not
establish an elapsed-time improvement. Each used 40 samples of 500 cycles. The
single-owner cycle timings were:

| run | baseline median | current median | baseline mean | current mean | mean change |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2.6 µs | 2.6 µs | 2.620 µs | 2.745 µs | +4.8% |
| 2 | 2.4 µs | 2.4 µs | 2.530 µs | 2.620 µs | +3.6% |

The distributions overlap: the first run's baseline/current minimum-to-p95
intervals were 2.0–3.2/2.2–3.6 µs, and the second run's were both 2.0–3.2 µs.
Those short samples could not exclude a small elapsed-time regression.
Urgent-control medians were 1.4/1.4 µs in the first run and 1.4/1.2 µs in the
second; two-owner medians were 3.4/3.4 and 3.2/3.0 µs.

Two further independent quiet runs increased each of the 40 samples to 10,000
cycles to reduce timer granularity effects. They did not reproduce the higher
single-owner means: 2.189→2.128 µs and 2.225→2.130 µs, with medians 2.17→2.10 µs
and 2.18→2.08 µs. All scenarios' mean changes in those longer runs were:

| scenario | long run 1 | long run 2 |
| --- | ---: | ---: |
| urgent | −0.1% | +1.5% |
| single owner | −2.8% | −4.2% |
| repeated owner | −1.3% | −2.4% |
| two owners | +0.7% | −1.5% |
| two updates | −0.5% | −1.9% |

Every run passed the same semantic and work-count gates. The longer samples
did not show a consistent regression, but distributions still overlap and
sample duration changes the result. Timing remains diagnostic, without a
regression threshold or a general latency-improvement claim.

The supported tradeoff is one fewer short-lived collection per common
single-owner batch and one fewer lookup per staged state update, for 218 extra
bytes in this fixture bundle. That recurring work reduction is the acceptance
evidence. A garbage-collection, retained-memory, or latency benefit has not been
established by these measurements.

These scenarios do not measure suspended renders, held DOM, awaited Actions,
rejection, or overlapping independent transitions. Their behavioral tests remain
necessary, and improvements here do not establish faster performance there.
