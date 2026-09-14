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

- Immutable main baseline: `361e51886879e1b50cd0cfd7823a8fc2966c824f`.
- Candidate worktree based on `6be8889f3b619b09d1bf385049fa4fe3f98c1ba9`,
  including the review fixes and Octane 0.2.11 release merge; aggregate source SHA-256
  `9fdce3ea7520f3ac8bf84c4d17e1448e521a400ba736419e8785d9297284e4bf`.
- [All 28 cases, raw samples, command, environment and per-file hashes](./results-2026-09-14.json).

### Cache workload, Strong enabled

| Lane | Functions | Baseline median ms | Candidate median ms | Baseline p95 ms | Candidate p95 ms | Paired median ratio | Emitted bytes, baseline → candidate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| prod-client | 100 | 37.34 | 66.00 | 56.54 | 98.56 | 1.739 | 75,680 → 147,150 |
| prod-client | 1,000 | 398.85 | 693.95 | 518.51 | 752.15 | 1.817 | 761,481 → 1,505,151 |
| dev-hmr | 100 | 41.59 | 58.84 | 67.55 | 78.78 | 1.404 | 149,894 → 189,930 |
| dev-hmr | 1,000 | 464.42 | 609.22 | 524.65 | 826.20 | 1.344 | 1,526,325 → 1,941,061 |
| server | 100 | 17.86 | 29.00 | 21.38 | 31.93 | 1.589 | 40,462 → 55,528 |
| server | 1,000 | 199.33 | 343.73 | 338.94 | 391.99 | 1.590 | 409,463 → 562,529 |
| plain | 100 | 6.02 | 9.10 | 10.24 | 12.93 | 1.424 | 39,437 → 77,459 |
| plain | 1,000 | 94.31 | 114.67 | 247.44 | 157.77 | 1.091 | 403,137 → 797,859 |

The new caches intentionally increase generated code. These byte counts are
unminified compiler output, not application bundle measurements. Across the
cache workloads, Strong paired ratios are **1.091–1.817**: roughly **9.1–81.7%**
additional compile time versus main. The mode, size and output difference matter;
these results do not establish an application-wide budget or a runtime speedup.

### Strong controls without eligible cache declarations

| Workload | Functions | Baseline median ms | Candidate median ms | Paired median ratio |
| --- | ---: | ---: | ---: | ---: |
| normal | 100 | 39.80 | 45.08 | 1.101 |
| normal | 1,000 | 451.28 | 497.75 | 1.079 |
| ambient | 100 | 40.40 | 45.10 | 1.160 |
| ambient | 1,000 | 417.23 | 483.50 | 1.167 |
| alias-heavy | 100 | 39.42 | 47.25 | 1.176 |
| alias-heavy | 1,000 | 444.82 | 520.47 | 1.177 |

All 24 client/server comparisons for these controls remain byte-identical.
Their Strong paired ratios range from **1.079–1.177**. They measure
analysis overhead without new declaration caches.

### Compatibility controls

| Workload / lane | Paired ratio, 100 functions | Paired ratio, 1,000 functions |
| --- | ---: | ---: |
| normal / prod-client | 0.987 | 0.981 |
| ambient / prod-client | 1.002 | 0.973 |
| alias-heavy / prod-client | 1.002 | 1.025 |
| cached / prod-client | 1.014 | 1.042 |
| cached / dev-hmr | 1.018 | 0.994 |
| cached / server | 1.001 | 1.015 |
| cached / plain | 0.917 | 0.613 |

Compatibility output and executed value/identity controls agree with main. The
large plain-module control benefits from assembling disjoint source edits once.
Small-case variability remains substantial; raw pair ratios and p95 are recorded
so isolated timing changes are not mistaken for general speed improvements.

### Improvement found by the expanded audit

The first full run exposed repeated whole-source copying for each plain-module
edit: the 1,000-function Strong case had a **4.246** paired ratio against
main `1bc1926e809b6f1958dbc274dc68ad1334f68efc`.
The slotter now assembles disjoint edits from chunks and preserves the existing
sequential behavior for overlapping ranges. A mutation-tested regression covers
nested edits, authored comments/lines, and live state. The follow-up run against
that same baseline measured **1.036**; the final release-baseline run above
measured **1.091**. These are separate full runs; a five-pair direct before/after
check also confirmed the improvement, but its timings are not mixed into the
table. All 28 emitted output records match both the pre-optimization and
pre-release runs exactly. The release merge changes package/version metadata
without changing compiler or runtime implementation.

The eight executed lane/policy controls pass. A baseline-as-candidate negative
control fails the new identity requirement, so unchanged observations alone
cannot hide missing caches. Source and dependency hashes are stable throughout
the final run. Cold startup, runtime allocations or duration, hydration, browser
layout, type checking, non-DOM renderer cost and complete bundler builds remain
outside this measurement.
