# Root suspension: performance evidence

Measured candidate for issue #821: package `fd3719ab`, based on upstream `fd6ce69`. Ordinary work, root-journal coverage, affected suspension controls and executable bundle oracles pass. **Material ordinary-render overhead remains.** First final-source pair: ordinary parent updates 2.98→6.44ms (+116.1%). Reverse-order pair: 1.84→3.58ms (+94.6%). Cross-run baseline drift prevents treating these measurements as a precise general estimate.

The specialized-root bundle grows **2,995 gzip bytes (+22.9%)**; the reusable-root bundle grows **5,649 (+14.9%)**. Current-head CI is tracked separately.

## Inputs and method

- Baseline: `fd6ce69c13daf7aa4eb41b4450382d6370b7993f`; package SHA-256 `c3eaf6e17163b89a9f74e66b8b8c337679d2e2b33eba17bdbc11d466a55af887`. Historical 31abee production work/bytes match this updated baseline.
- Candidate package SHA-256: `fd3719abbc2b5336a05c4004f41d2b137c8ee96f3acb8ab407d2646038fb46ac`.
- Candidate runtime SHA-256: `eeab62c2f34c897f9bd712bb6786a73cfd94e5d822421450e116360d7b2efff8`.
- Candidate compiler SHA-256: `272ea9cae362b0c9d6a4616e740db0ebaf75e212f40608297f58839f2e7fec73`.
- Apple M5 Max, Darwin 25.6.0 arm64; Node 26.4.0; Chromium 149.0.7827.55; Playwright 1.61.1; Vite 8.1.5; esbuild 0.28.1; @tsrx/core 0.1.58, package-default native parser; React 19.2.7 semantic twin.
- Production compiler/runtime with HMR and runtime profiling disabled. Work uses unminified jitless assets; executable bundle and timing controls use esbuild-minified assets. Source, fixture, lockfile, environment and semantic checksums are checked before comparison.

The [machine-readable summary](root-suspension-performance.json) contains exact metadata, recorded counts, compressed sizes, timing samples, commands and evidence paths. Executed assets and exact candidate source are preserved separately from later edits.

## Ordinary work and root-journal coverage

All six recorded Activity work observations match the baseline, including semantic checksums, named calls and DOM writes. The two ordinary controls preserve row/input identity, edited uncontrolled drafts, state and effect lifetime. Setup and verification are outside coverage.

| Control | renderBlock calls | List snapshots | State-attribute writes | Added / removed rows |
| --- | ---: | ---: | ---: | ---: |
| plain_updates | 6,168 | 0 | 3,072 | 0 / 0 |
| plain_descendant_updates | 256 | 0 | 256 | 0 / 0 |

The unchanged-list guard is zero `journalForSlot` calls per 3,072 row updates. Ordinary effect/subtree snapshot, subtree-walk, ref-detach and Activity helper metrics also remain zero. These selected metrics do not count all root-transaction work.

Supplemental precise coverage proves that **both** ordinary controls now enter the required root journal:

| Helper | 12 parent updates × 256 rows | One queued wave of 256 descendant updates |
| --- | ---: | ---: |
| beginRootRender | 12 | 256 |
| createOffscreenCapture | 12 | 1 |
| commitRootRenders | 12 | 1 |
| journalObjectOnce | 6,156 | 512 |
| journalBag | 6,156 | 512 |
| journalRootProperty | 6,180 | 0 |
| journalText | 3,084 | 256 |
| journalAttr | 3,072 | 256 |

The 256 descendant entries share one capture and commit wave. Full object-journal calls on the parent path fall 12,300→6,156 after whole-record snapshots of unchanged effects are removed. Attempt-local presence stamps now need no undo; property-journal calls are 6,180 for parent updates and 0 for descendants. Calls can deduplicate and are not allocation counts.

## Affected suspension work

The [committed runner](../../../benchmarks/suspense-recovery/root-work.mjs) reuses the five-shape browser fixture without component-body probes: **10 Octane hold/retry work windows and 10 independent React semantic controls pass**. React authors identical marker props; no attribute normalization masks output differences.

Every hold preserves exact comment-stripped markup, root/input/reader identity, focused draft/selection and mounted lifetime, with no native focus events or retained-range removal. Retry commits B, preserves promised survivors, performs one connected cleanup and unmounts without errors.

| Shape / window | renderBlock | New blocks | Replacement body | WIP helper | Added / removed nodes |
| --- | ---: | ---: | ---: | ---: | ---: |
| component / hold | 5 | 1 | 1 | 1 | 3 / 3 |
| component / retry | 5 | 1 | 1 | 1 | 3 / 3 |
| branch / hold | 6 | 2 | 1 | 1 | 3 / 3 |
| branch / retry | 6 | 2 | 1 | 1 | 3 / 1 |
| root / hold | 3 | 3 | 1 | 0 | 4 / 4 |
| root / retry | 3 | 3 | 1 | 0 | 5 / 1 |
| keyed / hold | 5 | 0 | 0 | 0 | 0 / 0 |
| keyed / retry | 5 | 0 | 0 | 0 | 0 / 1 |
| empty / hold | 4 | 1 | 0 | 0 | 1 / 1 |
| empty / retry | 4 | 1 | 0 | 0 | 1 / 2 |

Replacement bodies run once per actual component/branch/root attempt; the reader runs once and retired input bodies zero times. Keyed hold creates no blocks or observed container mutations. Empty hold adds/removes one speculative node. Other staging performs real DOM work; the observer does not see detached staging, and physical mutation counts need not match React.

## Executable bundle cost

| Fixture | Raw bytes, baseline → candidate | Gzip bytes, baseline → candidate | Gzip increase |
| --- | ---: | ---: | ---: |
| root-static-specialized | 37,862 → 47,484 | 13,069 → 16,064 | +2,995 (22.9%) |
| root-static | 117,281 → 136,055 | 37,811 → 43,460 | +5,649 (14.9%) |
| hooks-state | 120,457 → 139,429 | 38,982 → 44,702 | +5,720 (14.7%) |
| component-owned-effects | 118,269 → 137,055 | 38,213 → 43,870 | +5,657 (14.8%) |
| root-descriptor | 117,102 → 135,952 | 37,751 → 43,421 | +5,670 (15.0%) |

All five public oracles pass; Activity stays unreachable in each. The specialized control also excludes list snapshot/restoration, concrete Suspense publication and root-P1 transition helpers. Reusable controls retain root-P1 helpers through already-reachable `startTransition`; concrete `recordSuspenseCommit` is removed. Function-name reachability is diagnostic, not per-helper minified-byte attribution.

Activity App codegen: 2,838→2,866 minified bytes, 1,207→1,221 gzip bytes. RefControl remains 1,965 minified / 903 gzip bytes. Brotli totals are in JSON. No committed minimal bundle ceilings are raised.

## Quiet paired timing

The first pair ran baseline then candidate without competing task tests/builds. JIT is enabled, with three warmups and eight retained samples per operation. Explicit GC, setup, semantic verification and cleanup are outside the timer.

The executable baseline is byte-identical to the preceding pair, yet its plain-update score changed 1.96→2.98ms (+52.0%); other baseline controls drifted +31–121%. The cause is unmeasured. A single bounded confirmation ran candidate first, then baseline, on those same minified assets after a recorded 30-second idle interval. Both pairs are shown; neither is discarded.

| Run order | Control | Baseline score ms | Candidate score ms | Change | Baseline / candidate RME % |
| --- | --- | ---: | ---: | ---: | ---: |
| baseline → candidate | plain_updates | 2.98 | 6.44 | +116.1% | 4.6 / 4.5 |
| baseline → candidate | plain_descendant_updates | 0.42 | 0.70 | +66.7% | 16.6 / 0.0 |
| candidate → baseline | plain_updates | 1.84 | 3.58 | +94.6% | 4.9 / 5.9 |
| candidate → baseline | plain_descendant_updates | 0.22 | 0.42 | +90.9% | 18.2 / 15.8 |

First final-source pair: ordinary parent updates 2.98→6.44ms (+116.1%). Reverse-order pair: 1.84→3.58ms (+94.6%). Between-run baseline drift and possible order effects limit a precise speed ratio. These local measurements establish material overhead, not a general application slowdown or a confidence interval.

The [shared score](../../../benchmarks/lib/stats.mjs) is the latest contiguous five-sample mean within 8% of the best five-sample mean, not the overall eight-sample mean. Median, p95 and RME use all eight. The JSON retains all 12 timing windows, medians/p95, and every raw sample for each completed pair; raw runner reports retain score-window RME too.

Short descendant windows are quantized and noisy; near-zero within-run RME can reflect repeated timer buckets, not high accuracy. Earlier candidates’ descendant results bypassed required journaling and are superseded by the final coverage checks above. Within-run RME does not capture between-run baseline drift. The idle interval does not prove a fixed power/thermal state.

Read-only battery/thermal queries and their statuses were recorded immediately before and after confirmation. These endpoints do not establish the cause of prior drift or a constant power/thermal state during either pair.

Completed reverse-order confirmation commands:

```bash
BENCH_JSON=/private/tmp/octane-821-perf/final-v3-reverse-candidate-activity-timing.json node benchmarks/activity/run.mjs 8 --target=octane-tsrx --no-build
BENCH_JSON=/private/tmp/octane-821-perf/final-v3-reverse-baseline-activity-timing.json node benchmarks/activity/run.mjs 8 --target=octane-tsrx --octane-revision=fd6ce69c13daf7aa4eb41b4450382d6370b7993f --no-build
```

## Hot-path costs and bounded optimization history

- Each affected root commit wave opens a RootRenderTransaction, flat undo log, touched-object Map, and OffscreenCapture. The capture has eight arrays (effects outer/three inner, events, eventActions, refs, stores), even when empty; there is no buffer/frame pool.
- Each queued origin entering the root window allocates a RootRenderFrame; nested renders within that same active owner reuse the window. The final descendant control enters 256 times while sharing one capture/commit wave.
- The first touched object at a checkpoint copies one own-value snapshot; cold rollback enumerates keys, removes additions, and restores array length separately. Repeated journalObjectOnce calls can deduplicate, so calls are not allocation counts.
- Stable active effects update an attempt-local presence stamp without journaling it; retries mint a fresh version. Whole-record snapshots remain on dependency changes and omitted/reactivated effect paths. Scalar undo uses flat log entries. Structural Maps/Sets, node ranges, closures, and WIP are lazy and tied to actual shape changes.
- The added root entry path does not prewalk the subtree. Owner lookup reads inherited block.idState.renderOwner, now also inherited through lite wrappers. The added retired-subtree ancestry check runs only for a nonempty retired Set; existing effect/Activity ancestry work is not claimed absent.
- Actual component/branch replacement bodies execute once per captured WIP attempt, not an extra preflight followed by a second successful render. Staging still creates blocks and performs real DOM work.

These are source-level allocation observations, not a heap profile or zero-allocation claim. The preserved 9474 candidate measured 1.82→4.04ms (+122.0%) for ordinary parent updates. One-object snapshots (5c2558f3) measured 1.94→3.68ms (+89.7%) in a new pair. Baselines drifted between pairs, so those differences are not isolated causal estimates.

A separate unminified JIT diagnostic of 5c2558f3 (40 operations, 100µs interval) assigned 14.2% of asset self time to `journalObjectOnce` and 11.7% to `journalText`. It exposed 6,144 whole-record journal calls for stable effects and the ownerless descendant path. The next candidate (8d041c13) used scalar effect-stamp undo and fixed lite ownership, measuring 1.96→3.34ms (+70.4%). The final candidate removes only that attempt-local stamp undo, retains lifecycle/dependency rollback, and is remeasured above with the corrected descendant ownership. Historical profiles are not final timing or heap attribution; GC was small only in those sampled windows.

## Reproduction and scope

Use frozen-lockfile dependencies and installed Playwright Chromium. Completed public runner commands:

```bash
BENCH_JSON=/private/tmp/octane-821-perf/baseline-fd6ce69-activity-work.json node benchmarks/activity/work.mjs --target=octane-tsrx --octane-revision=fd6ce69c13daf7aa4eb41b4450382d6370b7993f
BENCH_JSON=/private/tmp/octane-821-perf/baseline-fd6ce69-activity-bundle.json node benchmarks/activity/bundle.mjs --target=octane-tsrx --octane-revision=fd6ce69c13daf7aa4eb41b4450382d6370b7993f
BENCH_JSON=/private/tmp/octane-821-perf/final-v3-activity-work.json node benchmarks/activity/work.mjs --target=octane-tsrx
BENCH_JSON=/private/tmp/octane-821-perf/final-v3-activity-bundle.json node benchmarks/activity/bundle.mjs --target=octane-tsrx
BENCH_JSON=/private/tmp/octane-821-perf/final-v3-root-suspension-work.json node benchmarks/suspense-recovery/root-work.mjs
BENCH_JSON=/private/tmp/octane-821-perf/final-v3-baseline-activity-timing.json node benchmarks/activity/run.mjs 8 --target=octane-tsrx --octane-revision=fd6ce69c13daf7aa4eb41b4450382d6370b7993f
BENCH_JSON=/private/tmp/octane-821-perf/final-v3-activity-timing.json node benchmarks/activity/run.mjs 8 --target=octane-tsrx
```

Raw JSON/logs and supplemental helper/profile scripts are preserved under `/private/tmp/octane-821-perf/` on the audit machine; the JSON lists exact paths. The committed work runners reproduce the primary controls. The failed marker-twin run is retained as failed evidence, not counted as a result.

- The pre-fix no-boundary path is semantically broken, so no suspended-path speed ratio is claimed. The React twin checks observable behavior, not internal work or speed; this is not a React Compiler comparison.
- Named calls and container MutationObserver records do not measure arbitrary allocation, detached-DOM writes, GC pressure or asymptotic scaling. Equal named ordinary counters are not zero overhead.
- Five urgent public-root-render shapes use public use(promise); raw thenables, hydration, transitions, errors, supersession, and universal ownership are regression-suite coverage outside this work measurement.
- Both quiet timing pairs are sequential, with run order reversed for confirmation, not randomized interleaving. Small descendant windows are timer/noise sensitive; inspect all raw samples and RME. Older descendant results omitted required journaling and are not evidence of correct-path cost.
- Node 26.4.0 differs from CI Node 24. Do not ratchet committed bundle budgets from these local results; existing baseline controls already exceed some older ceilings.
- Unminified function-name reachability and the historical CPU sample profile are diagnostics, not exact minified-byte or allocation attribution. Current-head CI is tracked separately.
