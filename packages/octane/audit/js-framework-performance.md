# js-framework performance investigation — 9 October 2026

Investigation baseline: [`a5e1816385fba69afde2b667943d98822b129e23`](https://github.com/octanejs/octane/commit/a5e1816385fba69afde2b667943d98822b129e23).
The published comparison has deteriorated relative to Ripple. A controlled
investigation found avoidable key-index construction. The retained runtime
change reduces 1,000-row swap time by **48–49% in TSRX and 20% in JSX** in the
follow-up against current main (see PR preparation below). This does not recover the whole published gap. Historical snapshots
cross changes to the reference framework, machine, OS, and harness. The baseline
was the latest upstream `main` fetched at investigation start; this repository
uses `main`, rather than `master`.

## Published result and source

A fresh `curl -L https://octanejs.dev/` on 9 October returned v0.12.0 and
Ripple **0.68× Octane** for js-framework. This agrees with the checked-in
ratio **0.6822892272773937**. A search-provider page extraction returned an
older v0.10.2/0.75× snapshot; the direct response is the current observation.

[`website/src/content/benchmarks.ts`](../../../website/src/content/benchmarks.ts)
imports [`benchmarks/baselines/local/js-framework.json`](../../../benchmarks/baselines/local/js-framework.json).
[`home-benchmark.ts`](../../../website/src/content/home-benchmark.ts) computes
the geometric mean of ten per-operation `score` ratios, falling back to
`median` only when `score` is absent. Each operation has equal logarithmic
weight, regardless of its absolute duration.

The latest publication is [#1933 / `baac5f3f7`](https://github.com/octanejs/octane/commit/baac5f3f7941d355950bdf9c65745dd263ae52bd).
It measures the Octane 0.12.0 release
[`961638e3c41dce5020560b56fa5e084b4257e33e`](https://github.com/octanejs/octane/commit/961638e3c41dce5020560b56fa5e084b4257e33e),
not the investigation baseline above. Source, CI run, environment, and existing
guard breaches are recorded in
[`website-refresh.md`](../../../benchmarks/baselines/website-refresh.md).

## Historical observations

Recomputed from each commit's `benchmarks/baselines/local/js-framework.json`.
These ratios are **Octane / Ripple**; below 1 favors Octane. The homepage
displays their reciprocals. Excluding selection is diagnostic, not a proposed
change to the published suite.

| Snapshot                                                                                          | Date   | All ten operations | Excluding `select` and `select_lots` |
| ------------------------------------------------------------------------------------------------- | ------ | -----------------: | -----------------------------------: |
| [`939c64dc9`](https://github.com/octanejs/octane/commit/939c64dc9d9f0fd5c5fe50255fe75ce592d0b31a) | Aug 19 |             0.582× |                               0.952× |
| [`a3155a5ab`](https://github.com/octanejs/octane/commit/a3155a5ab6b717115a4c16c45994ace03a21faea) | Aug 28 |             0.722× |                               1.099× |
| [`e98b29e3d`](https://github.com/octanejs/octane/commit/e98b29e3dd848b44d5fbdfe0f8dad111f8836b27) | Sep 14 |             0.838× |                               1.177× |
| [`dbd022141`](https://github.com/octanejs/octane/commit/dbd0221415be8e3cd6fe77ca2e01d40861feff81) | Oct 3  |             1.326× |                               1.213× |
| [`baac5f3f7`](https://github.com/octanejs/octane/commit/baac5f3f7941d355950bdf9c65745dd263ae52bd) | Oct 9  |             1.466× |                               1.426× |

Selected recorded scores, **Octane / Ripple in milliseconds**:

| Operation                 |        Sep 14 |         Oct 3 |         Oct 9 |
| ------------------------- | ------------: | ------------: | ------------: |
| Create 1,000 (`run`)      |   2.36 / 2.36 |   2.02 / 1.70 |   3.20 / 2.48 |
| Update every tenth row    |   0.40 / 0.30 |   0.28 / 0.18 |   0.68 / 0.22 |
| Select among 1,000        |   0.20 / 0.48 |   0.12 / 0.04 |   0.22 / 0.10 |
| Swap                      |   0.58 / 0.34 |   0.28 / 0.18 |   0.58 / 0.32 |
| Create 10,000 (`runlots`) | 14.76 / 13.66 | 14.72 / 15.42 | 26.78 / 36.50 |
| Select among 10,000       |   0.16 / 1.44 |   0.12 / 0.10 |   0.34 / 0.28 |
| Clear 10,000              | 20.46 / 20.22 | 22.66 / 23.30 | 51.50 / 39.62 |

The two selection operations account for **94.7% of the Sep 14→Oct 3
log-geomean change**: sum their `log(new ratio / old ratio)` contributions
and divide by the sum across all ten operations. Octane's recorded selection
scores improved while Ripple improved more. This explains the arithmetic
cross-over; it does not isolate the cause of either implementation's change.

## Measurement and dependency confounds

- Sep 14 used an M5 Max with macOS 26.6.2. Oct 3 used an M5 Max with macOS 27.0
  and two unrelated active test workers. Oct 9 used four-vCPU AMD EPYC Ubuntu
  CI. Absolute timings across these recordings are not controlled comparisons.
- [#1098 / `bb11d0b3e`](https://github.com/octanejs/octane/commit/bb11d0b3ec9fc0cbe3723fc4e6bf0217d4149892)
  upgraded Ripple 0.3.128→0.4.0 and its compiler 0.1.65→0.2.0 on Sep 15.
  It also migrated the Ripple fixture from tracked destructuring to explicit
  `track().value` reads/writes. Octane's fixture behavior did not change there.
- Both immutable Ripple compiler packages already contain identical
  `visit_selector_comparison` lowering, and both runtime packages contain
  previous/new-key selector invalidation. A newly introduced selector cannot
  be inferred from the upgrade; actual fixture codegen still needs comparison.
- [#1164 / `c756d590c`](https://github.com/octanejs/octane/commit/c756d590cb77f8cca51ee8c0e5ccc707c5d1c39c)
  adds a layout flush before timed clicks on Sep 20.
- [`run.mjs`](../../../benchmarks/js-framework/run.mjs), used for homepage
  records, takes eight single-click samples with mount/clear warmup and a
  separate browser per target. Sub-millisecond operations approach the 0.1ms
  timer floor. Oct 3 Ripple selection scored 0.04ms with a 0.1ms median and
  277.6% score RME; Oct 9 Octane selection has 47.2% score RME.
- [`pair.mjs`](../../../benchmarks/js-framework/pair.mjs), introduced by
  [#1640](https://github.com/octanejs/octane/commit/ac729dc14832c082b77cd1bf03b8fb7509ced89a),
  alternates baseline/candidate samples and loops repeatable operations toward
  20ms. Its timing and exact-work controls are separate from homepage records.
- Current [`ratios.json`](../../../benchmarks/baselines/ratios.json) has no
  js-framework Octane/Ripple timing guard. Main's React/Solid/TSRX dependencies
  have also advanced beyond those in the published release measurement.

## Hypotheses to test

1. Profile immutable partial updates and keyed-list bookkeeping: the current
   published update score is 3.09× Ripple, while creation of 10,000 rows wins.
2. Isolate root transaction/journaling costs. The earlier non-selection drift
   overlaps [#833 / `5f7a4579b`](https://github.com/octanejs/octane/commit/5f7a4579bab1a9987cb54fb6b2fc1f314497fc3c).
   Its [root-suspension audit](root-suspension-performance.md) records +68%
   ordinary parent-update overhead in a different fixture. This is a profiling
   lead, not attribution of the js-framework gap to that commit.
3. Compare old/new Ripple fixture output and runtime on fixed hardware before
   attributing its selection improvement to compiler or runtime changes.

## Retained change: index only displaced keys

The existing reconciler already has a shortcut for moving a few rows. It first
built a Map for almost the entire middle of the list, however: swapping rows
2 and 999 indexed 998 keys before moving two rows. The change omits Map entries
for keys that remain at the same middle-relative position and matches those
survivors directly by index. Displaced keys keep the existing Map lookup.

The optimization is restricted to equal-length middles whose first actual
middle key already exists. Fresh replacements keep the complete-map path.
Prefix and suffix paths are unchanged. Key getters run in their original
sequence; the recorded middle keys remain authoritative. An omitted stable
key prevents full-list clearing, including when a getter changes between the
prefix probe and middle read. `NaN` uses Map matching, and unequal lengths
cannot enter the direct-index path.

No new cache, helper, retained state, or DOM strategy is introduced. Journaling,
survivor updates, insertion order, the displacement shortcut and LIS placement
retain their existing implementation. Unique keys retain the same output and
survivor identity. Duplicate-key diagnostics and existing unrelated-survivor
checks pass; identity assignment among duplicate keys remains unsupported and
can differ.

A native `Map.prototype.set` observer, installed only during a separate
instrumented run, records **1,005 → 9 Map writes per swap**. That is 996
unnecessary key entries removed. Every other canonical operation's Map-write
count is unchanged. These are operation counts, not measured heap allocations.
The observer is absent from all timing runs.

The final 30-pair comparison and its uncertainty are recorded in the
[machine-readable summary](js-framework-performance.json). Baseline and
candidate use fixed minified artifacts, identical repeat counts, five warmup
pairs and alternating sample order. Short operations loop above the timer
floor; each batch verifies its visible result. Reverse/shuffle, removal and
repeated full replacement are explicit cost-transfer controls. The broader
14-operation reorder matrix also passed its node-identity/order gates during
the investigation.

Final clean run, **candidate / baseline** with paired 95% bootstrap intervals:

| Operation                      | Ratio |    Interval | Interpretation       |
| ------------------------------ | ----: | ----------: | -------------------- |
| TSRX swap                      | 0.564 | 0.558–0.577 | 44% lower time       |
| JSX swap                       | 0.770 | 0.763–0.778 | 23% lower time       |
| TSRX update                    | 0.990 | 0.971–1.001 | No detected change   |
| TSRX front removal             | 1.000 | 1.000–1.033 | No detected change   |
| TSRX reverse                   | 0.995 | 0.986–1.002 | No detected change   |
| TSRX shuffle                   | 0.986 | 0.978–1.007 | No detected change   |
| TSRX repeated full replacement | 0.978 | 0.973–0.991 | No detected slowdown |

The preceding run of the same final artifact measured 48% lower TSRX swap time
(ratio 0.523, interval 0.517–0.529). A short typecheck overlapped its startup,
so the fully isolated repeat above is primary. No unrelated control speedup
is claimed. These are repeated-operation local timings, not a 44–48% whole-suite
improvement. The production bundles grow by 63 gzip bytes for TSRX and 81 for JSX.

In a separate final-artifact comparison with Ripple, TSRX swap time is 1.17×
Ripple (interval 1.164–1.180); partial update remains 1.56× and selection about
1.60–1.69×. The remaining gaps are real in this local workload. This comparison
uses longer samples than the homepage and cannot be substituted for its score.
The frameworks also map seeded random labels differently, so cross-framework
inputs are not byte-identical. The controlled patch comparison uses identical
Octane code and inputs apart from the runtime change.

## PR preparation against current main

The publication branch incorporates upstream `4f82777bbdd1cc255afc4220f26906d062ebc09f`
(#1937) as its base. The swap implementation is unchanged. Frozen baseline and
candidate builds were measured again with the same controlled scripts and tools.
The previous tables remain historical measurements against `a5e1816`.

| Operation                      | First candidate / base |   Full-matrix repeat |
| ------------------------------ | ---------------------: | -------------------: |
| TSRX swap                      |   0.515 [0.512, 0.521] | 0.524 [0.520, 0.525] |
| TSRX update                    |   1.004 [0.994, 1.013] | 1.004 [0.998, 1.013] |
| TSRX front removal             |   1.000 [1.000, 1.043] | 1.000 [1.000, 1.045] |
| TSRX reverse                   |   1.044 [1.020, 1.054] | 0.994 [0.984, 1.009] |
| TSRX shuffle                   |   1.016 [0.995, 1.038] | 1.000 [0.964, 1.011] |
| TSRX repeated full replacement |   1.025 [1.011, 1.083] | 1.022 [0.992, 1.048] |

JSX swap ratio is **0.799 [0.789, 0.811]**. The initial reversal slowdown did not
repeat. Replacement point estimates remain 2.2–2.5% slower, with the repeat
interval crossing 1; a possible small replacement cost remains uncertain.
Both complete matrices are retained. No additional fast-path heuristic was added
in response to the unreplicated reversal result, and uniformly neutral controls
are not claimed for this base.

All canonical function-call and DOM work counters remain identical in both
dialects, and browser semantic checks pass. **800** scoped development/production
test executions and the core typecheck pass after integration. Final source and
served artifact hashes, exact paired intervals and raw result names are in the
JSON summary's `prPreparation` section. Current-head CI remains a separate gate.

## Why the smaller update shortcut was deferred

A second experiment separated DEP-PURE survivor skipping from lightweight row
rendering. It reduced update production calls from 3,583 to 3,283, preserved
100 DOM writes and all journals, and improved partial-update timing by roughly
5–7%. But longer adversarial operation histories exposed a 2–3 microsecond
front-removal slowdown, about 15%, in candidates containing that shortcut.

Fresh-context removal was neutral, and sparse indexing versus the frozen
update-only candidate was also neutral under the same history. These results
point away from sparse indexing, but do not establish a specific JIT/GC cause.
The row-render shortcut, its mirrored map-path experiment, and their dedicated
fixtures were removed from the final change. Their raw evidence is retained.
The final sparse-only candidate is compared against the original baseline
with that same update → swap → removal history.

An initial sparse-index variant walked old rows even for fresh replacements
and measured about 3% slower replacement. Selecting the strategy inside the
middle-key loop avoids that unnecessary walk and leaves prefix/suffix paths
untouched. Final replacement and broad-reorder controls are reported alongside
the swap improvement; incidental speedups on unrelated controls are not claimed.

## Environment, commands and evidence

Apple M5 Max, macOS 26.7.1 arm64, Node 22.22.3, Chromium 149.0.7827.55,
Playwright 1.61.1, Vite 8.1.5, and exact selected dependencies from the baseline
lockfile. User-installed pnpm 12.10.1 installed the selected tools with a frozen
lockfile and managed supply-chain checks. Repository manifests and lockfile
are unchanged. Unrelated dev-tool tarballs prevented a full workspace install;
the selected tools live in `/tmp/octane-performance-tools-a5e1816`.

The baseline production artifacts were frozen before runtime edits at
`/tmp/octane-js-framework-baseline-a5e1816`. The repository's paired runner
established canonical timings and semantic work:

```sh
node benchmarks/js-framework/pair.mjs \
  --base-tree=/tmp/octane-js-framework-baseline-a5e1816 \
  --base-json=benchmarks/results/js-framework-investigation/retained-work-base.json \
  --head-json=benchmarks/results/js-framework-investigation/retained-work-candidate.json \
  --work-only --no-build
```

Final production function-call totals and DOM work match the baseline for all
ten canonical operations in both dialects, and browser semantic/error checks
pass. Native Map writes are observed separately because production JavaScript
coverage does not count native calls.

Earlier `sparse-base.json` / `sparse-candidate.json` records include the
subsequently deferred update experiment. Final diagnostic scripts reuse
`timeSample` / `timeClick` and `pairedRatio` from the existing harness. They
hold repeat counts and operation history equal between sides. Coverage and Map
observation run in separate browsers, outside timing. Final artifacts, hashes,
commands and result provenance are in the JSON summary. Raw results, scripts,
scoped test configuration and logs are retained locally under
`benchmarks/results/js-framework-investigation/` (ignored by Git).

To repeat final timings, serve the frozen baseline and worktree TSRX builds
with `vite preview --host 127.0.0.1 --strictPort --port PORT` from their fixture
directories on ports 5376 and 5377 respectively, then run the saved
`playwright-octane-sparse-only-controls.cjs`. The JSX script uses baseline/head
ports 5379/5380; the Ripple comparison uses candidate 5377 and Ripple 5178.
The scripts record the browser version, repeat counts, every sample and paired
interval. They require the selected Playwright tools directory above. All
task-owned previews were stopped after collection.

This is the homepage's local click/commit workload, excluding paint and
Playwright transport. It is not a replacement result for the upstream
js-framework-benchmark Chrome-timeline suite. The published homepage data was
not refreshed by this task.

## Correctness and limits

- **798 test executions pass** across 12 relevant suites in development and
  production compilation, including keyed fuzzing, rollback, auto-memoization,
  native/custom-map roundtrips, hydration and duplicate-key diagnostics.
- New manual-key cases protect edited/focused input identity through sparse
  permutations, same-size partial replacement, unequal lengths and prefix/suffix
  boundaries. They include string, object, `NaN`, `undefined` and changing
  getter keys; existing mixed-key tests also cover symbols.
- The retained new contracts pass on the original unmodified runtime. Removing
  direct stable-index lookup caused identity failures. Removing the full-clear
  safeguard failed the changing-getter case in both compilation modes, even
  though the replacement HTML looked identical. Both mutations were restored.
- The core TypeScript 7.1 typecheck, scoped standard TypeScript formatting and
  `git diff --check` pass. The test configuration reuses repository compiler
  plugins and per-test setup without importing unrelated binding projects or
  precompiling unused React differential fixtures.
- Full-workspace tests/typechecks, repository-wide formatting and CI were not
  run. Managed publication-age policy blocked unrelated
  `@tsrx/prettier-plugin@0.6.3`, `@tsrx/content-mapper@0.1.2` and
  `@tsrx/react@0.4.5` tarballs. There are no retained TSRX fixture edits.
- An independent complexity review checked the implementation and its semantic
  guards. This section records validation at the end of the investigation, before
  PR publication; subsequent current-head CI is reported in the pull request.
  No deployment or benchmark-data publication occurred.

During the investigation, a separate **pre-existing production rollback defect** was reproduced while
testing the deferred row-render experiment: a completed child can retain a
whole-list memo cache after a later sibling suspends, leaving old text after
retry. It fails on the original baseline too. The standalone reproduction and
evidence remain as `octane-captured-row-cache-repro.tsrx` and `.json` in the
local results directory. Upstream subsequently fixed this in [#1937](https://github.com/octanejs/octane/pull/1937), commit `4f82777bbdd1cc255afc4220f26906d062ebc09f`. PR preparation incorporates that fix as the base; it is not part of the swap optimization. The timing tables above remain measurements against the explicitly recorded investigation baseline.

Remaining priorities are better homepage sampling near the timer floor, the
immutable-list key walk versus independently tracked labels, and carefully
measured reductions in rollback bookkeeping. The generic update still reads
1,000 keys when changing 100 rows. Do not remove journals or weaken identity,
event, key-getter or suspension semantics to improve the score. Exact old/new
Ripple codegen is still needed to attribute its historical selection gain to a
specific implementation change.
