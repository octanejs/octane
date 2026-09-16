# Passive scheduling callbacks

The passive scheduler reuses a module-level callback instead of creating a
capture-free callback for each scheduled batch. Delivery still clears the
scheduling flag before draining effects, so an effect can synchronously update
another root and schedule another delivery. Inline drains retain the existing
generation cancellation, and View Transition receipts retain their own passive
work.

## Reproduce

Use the same dependencies and Node version for the frozen source and candidate:

```sh
BENCH_JSON=/tmp/passive-baseline.json node benchmarks/passive-scheduling/run.mjs /tmp/octane-runtime-pass-baseline
BENCH_JSON=/tmp/passive-candidate.json node benchmarks/passive-scheduling/run.mjs
node benchmarks/bench.mjs passive-scheduling --ratios
```

The frozen source for this pass is `733c98d57b76fcfbc8f1272cc1e202582f4bedfd`.
Set `PASSIVE_TIMING=0` to run only the deterministic work and semantic controls.
`PASSIVE_SOURCE_ROOT` supplies the source path when no positional path is given.

## Work and controls

The runner builds the actual production runtime twice. The clean bundle checks
visible output, retained DOM identity, cleanup before replacement, and unmount
cleanup. A separate untimed bundle observes callback identities at the
post-paint scheduler. Both must produce identical effect logs.

Across 128 dependency-changing public-root updates, the scheduler receives 128
callbacks. Baseline creates 128 distinct identities; the candidate uses one.
Across 128 updates with unchanged dependencies, both schedule zero callbacks.
The ratio guards preserve these callback and no-work budgets. These are
escaping callback identity counts, not measured heap bytes or application
latency claims. Each update drains effects inline and cancels the queued
post-paint delivery; the behavioral tests below exercise scheduled delivery.

Clean-bundle timings warm up with 2,000 effect updates and collect nine samples
of 2,000 public-root updates each. Each update commits DOM, drains passives,
and checks the effect lifecycle; each sample checks the visible final value.
The runner reports all samples and hashes the runtime source and clean bundle.
This Node/happy-dom workload does not measure browser paint or background-tab
latency.

## Recorded comparison

On macOS arm64 with Node 26.4.0, the valid sequential A–B–B–A comparison
produced these medians in microseconds per update:

| Baseline A1 | Candidate B1 | Candidate B2 | Baseline A2 |
| ---: | ---: | ---: | ---: |
| 1.910 | 2.007 | 2.375 | 2.820 |

Baseline samples range from 1.272–3.886 μs and candidate samples from
1.464–3.273 μs. The ranges overlap substantially and the baseline varies
between processes, so these timings establish no latency improvement.
[Raw measurements](measurements.json) contain only the final comparison with
every process awaited before the next began. An initial run that overlapped
another agent's tests and an early retry without verified process completion
were discarded; neither is included in the reported measurements.

The final candidate bundle includes the accompanying client empty-children
optimization. Callback identities are attributable to the scheduler change;
the complete bundle timings do not isolate it from that other change.
The final guard run after source formatting produced the same clean bundle as
both timed candidates: SHA-256
`7c70461d686d0a97df48e4b631f9a891baa0768d9fffb89bca2215b33a8750cc`,
406,802 raw bytes and 125,903 gzip bytes. The evidence records the final source
hash separately under `finalVerification`.

## Correctness coverage

`packages/octane/tests/effect-timing.test.ts` covers scheduled delivery after an
inline drain cancels an earlier delivery and passive work created by an effect
that synchronously updates another root. The ordinary effect timing suite also
covers deferred effects, cleanup ordering, and hidden-page timer fallback.
The change is client-only and applies to passive work after render or hydration;
server effect bodies do not execute.

All 28 effect-timing cases pass across the development and production compile
projects. Moving the scheduling-flag reset after the passive drain makes the
new reentrant test fail in both projects: the second root never installs its
updated effect. Restoring the original ordering returns all 28 cases to green.
With the complete workspace dependencies installed, run the suite using the
repository's standard configuration:

```sh
node_modules/.bin/vitest run --config vitest.config.js --project octane --project octane-prod packages/octane/tests/effect-timing.test.ts --silent=passed-only
```

The recorded local run substituted an untracked temporary config at
`node_modules/runtime-pass.vitest.config.mjs`, containing the root configuration's
`octane` and `octane-prod` project objects and omitting unrelated package
projects whose dependencies were unavailable.

Scoped fixture typechecking reports 20 existing implicit-parameter and
dependency-argument callback errors. Checking the byte-exact baseline fixture
and final fixture under identical temporary `tsrx-tsc` configs produces the
same 20 diagnostic messages; the new fixture introduces none.
