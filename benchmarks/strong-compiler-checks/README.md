# Strong compiler checks: paired compiler audit

This standalone Node harness compares a frozen Octane baseline with a candidate
checkout using the same installed dependencies. It measures warm compilation,
including parsing, analysis, lowering, and printing. Its cache workload covers
production client compilation, development/HMR compilation, server compilation,
and plain TypeScript hook-slot transformation. It does not measure runtime
speed, browser layout, hydration, application build time, or memory.

## Run

```bash
node benchmarks/strong-compiler-checks/run.mjs \
  --baseline /path/to/baseline-snapshot \
  --baseline-revision <full-commit-sha> \
  --output /tmp/strong-compiler-checks.json
```

The candidate defaults to the checkout containing the harness. `--candidate`
selects another checkout. The baseline must contain `packages/octane/src` and
`packages/octane/package.json` from the chosen immutable revision. Link its root
and Octane package `node_modules` to the candidate's installed dependencies. The
harness rejects different dependency resolutions.

Use `--smoke` to validate the harness with one component and one sample. This is
not performance evidence. `--counts 100`, `--scenario cached`, `--lane dev-hmr`,
`--iterations 17`, and `--warmups 3` narrow or override a full run. A positional
iteration count is also supported. `BENCH_JSON` supplies the output path if
`--output` is absent.

This audit requires an external baseline checkout, so it runs directly instead
of registering an unattended CI suite. Its JSON includes the benchmark runner's
`targets`, `ops`, and `failed` fields alongside the paired measurements.

## Workloads and controls

Each workload contains 100 and 1,000 exported functions and runs with Strong
enabled and in compatibility mode:

- **Normal:** state, a derived scalar, an effect, and an event handler per component.
- **Ambient:** legal browser reads in lazy state initialization, effects, and events.
- **Alias-heavy:** the same legal reads reached through module-level aliases.
- **Cached:** a `const` callback, array, and object per function. Each consumes
  `props.value` and is read only by an effect, so Strong's new automatic cache
  pass applies. The plain TypeScript lane uses exported custom hooks; the other
  lanes use components.

The normal, ambient, and alias-heavy workloads are production-client controls
with no declarations eligible for the new cache pass. Their baseline/candidate
JavaScript must match byte for byte on every sample, and a separate untimed
server compile must also match. These controls do not establish unchanged
output for Strong programs generally.

The cached workload runs four measured lanes: `prod-client`, `dev-hmr`, `server`,
and `plain`. Strong intentionally adds cache code, so baseline/candidate output
may differ. Each revision must emit stable, nonempty, diagnostic-free output
across samples. Byte counts and SHA-256 hashes for both are recorded. Compatibility
mode provides a control in which the new Strong cache pass is inactive.

### Executed cache controls

Before any timing, the harness compiles and bundles two independent owners with
each revision's real runtime. It executes value inputs `2 → 5 → 5 → 0` and checks
identical rendered text and observed callback/array/object values for both
revisions. A fresh observer on each render forces the effect to expose its
inputs, so a skipped effect cannot hide stale values or failed caching.

For Strong client, development/HMR, and plain-hook output, the candidate must
retain all three allocation identities when the value input repeats and replace
all three when that input changes. Baseline identities and compatibility
identities are recorded; compatibility must agree between revisions. These are
deterministic optimization controls, not runtime timing measurements. In the
server lane, effects do not run; repeated independent renders must return equal
HTML without calling the observer. The plain hook control is mounted through a
small compiled component wrapper outside the timed region.

The DOM shim is only used to execute these value/identity checks. It provides no
evidence about browser performance, layout, or hydration. HMR compilation is
covered, but applying a live HMR update is outside this benchmark.

## Measurement policy

Each case has three warmup pairs, then 17 measured pairs at 100 components or
11 at 1,000. Pair order alternates baseline/candidate and candidate/baseline.
Only compilation is timed; bundling, runtime controls, parity checks, and hashing
occur outside the timed interval. Both compilers share a Node process and
installed dependencies, so these are warm measurements with shared parser,
JIT, and garbage-collection effects. The full run contains 28 measured cases.

The JSON retains raw samples, median, p95, min/max, and each pair's candidate /
baseline ratio. Ratios above one indicate slower candidate compilation. It also
records the command, Node/V8/OS/CPU, revisions, source hashes, and dependency
resolution hashes. A source or dependency change during measurement fails the
run. Review variability and compatibility controls before attributing a timing
change to Strong analysis. With 11 or 17 samples, the reported p95 is the largest
sample; it is a variability indicator rather than a stable tail latency estimate.
The median of pairwise ratios can differ from the ratio of the separate medians.

## Review measurement

Measured on 14 September 2026 with Node v26.4.0, V8
14.6.202.34-node.21, Apple M5 Max,
darwin 25.6.0 arm64. Tests and builds were idle during
the measured run. All source and dependency hashes stayed stable.

- Immutable main baseline: `1bc1926e809b6f1958dbc274dc68ad1334f68efc`.
- Candidate worktree based on `c2e90295cab14dc5c81fee76405cf25a63040240`,
  including the review fixes; aggregate source SHA-256
  `65f43ad29e06ddab655193a363b052ecd4a56efbfe5a0c39eb42ae9b853bca87`.
- [All 28 cases, raw samples, command, environment and per-file hashes](./results-2026-09-14.json).

### Cache workload, Strong enabled

| Lane | Functions | Baseline median ms | Candidate median ms | Baseline p95 ms | Candidate p95 ms | Paired median ratio | Emitted bytes, baseline → candidate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| prod-client | 100 | 39.05 | 69.07 | 57.03 | 95.45 | 1.744 | 75,680 → 147,150 |
| prod-client | 1,000 | 433.31 | 723.88 | 492.86 | 770.43 | 1.668 | 761,481 → 1,505,151 |
| dev-hmr | 100 | 45.29 | 61.09 | 61.76 | 93.94 | 1.351 | 149,894 → 189,930 |
| dev-hmr | 1,000 | 479.94 | 636.27 | 526.01 | 695.48 | 1.292 | 1,526,325 → 1,941,061 |
| server | 100 | 20.04 | 31.12 | 24.32 | 38.89 | 1.593 | 40,462 → 55,528 |
| server | 1,000 | 231.47 | 368.55 | 260.05 | 424.18 | 1.603 | 409,463 → 562,529 |
| plain | 100 | 5.60 | 8.43 | 10.66 | 15.75 | 1.548 | 39,437 → 77,459 |
| plain | 1,000 | 95.12 | 97.39 | 119.56 | 113.56 | 1.036 | 403,137 → 797,859 |

The new caches intentionally increase generated code. These byte counts are
unminified compiler output, not application bundle measurements. Across the
cache workloads, Strong paired ratios are **1.036–1.744**: roughly **3.6–74.4%**
additional compile time versus main. The mode, size and output difference matter;
these results do not establish an application-wide budget or a runtime speedup.

### Strong controls without eligible cache declarations

| Workload | Functions | Baseline median ms | Candidate median ms | Paired median ratio |
| --- | ---: | ---: | ---: | ---: |
| normal | 100 | 47.60 | 56.13 | 1.057 |
| normal | 1,000 | 488.02 | 529.35 | 1.104 |
| ambient | 100 | 36.67 | 43.79 | 1.157 |
| ambient | 1,000 | 436.48 | 496.95 | 1.139 |
| alias-heavy | 100 | 40.02 | 46.47 | 1.165 |
| alias-heavy | 1,000 | 464.17 | 563.27 | 1.160 |

All 24 client/server comparisons for these controls remain byte-identical.
Their Strong paired ratios range from **1.057–1.165**. They measure
analysis overhead without new declaration caches.

### Compatibility controls

| Workload / lane | Paired ratio, 100 functions | Paired ratio, 1,000 functions |
| --- | ---: | ---: |
| normal / prod-client | 1.021 | 0.975 |
| ambient / prod-client | 1.004 | 1.022 |
| alias-heavy / prod-client | 1.007 | 1.025 |
| cached / prod-client | 1.006 | 0.974 |
| cached / dev-hmr | 1.007 | 1.044 |
| cached / server | 0.994 | 1.012 |
| cached / plain | 1.015 | 0.622 |

Compatibility output and executed value/identity controls agree with main. The
large plain-module control benefits from assembling disjoint source edits once.
Small-case variability remains substantial; raw pair ratios and p95 are recorded
so isolated timing changes are not mistaken for general speed improvements.

### Improvement found by the expanded audit

The first full run exposed repeated whole-source copying for each plain-module
edit: the 1,000-function Strong case had a **4.246** paired ratio against main.
The slotter now assembles disjoint edits from chunks and preserves the existing
sequential behavior for overlapping ranges. A mutation-tested regression covers
nested edits, authored comments/lines, and live state. The final ratio is
**1.036**. These are separate full runs; a five-pair direct before/after check
also confirmed the improvement, but its timings are not mixed into the table.
All 28 emitted output records match the pre-optimization run exactly.

The eight executed lane/policy controls pass. A baseline-as-candidate negative
control fails the new identity requirement, so unchanged observations alone
cannot hide missing caches. Source and dependency hashes are stable throughout
the final run. Cold startup, runtime allocations or duration, hydration, browser
layout, type checking, non-DOM renderer cost and complete bundler builds remain
outside this measurement.
