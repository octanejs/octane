# Root suspension: performance evidence

Measured candidate for issue #821 / PR #833: package `ab4765b1`, based on upstream `fd6ce69`. The fresh ordinary work, affected suspension controls and executable bundle oracles pass. **Material ordinary-control overhead remains.** The v4 ordinary parent-update control measures 2.00→3.36ms (+68.0%); median 2.10→3.50ms, p95 2.40→3.70ms. This is a cold uncaught-error ref-detachment correction, not a performance optimization. Cross-run timing drift prevents attributing differences from v3 to that change; no CPU gain is claimed.

The specialized-root bundle grows **3,002 gzip bytes (+23.0%)**; the reusable-root bundle grows **5,647 (+14.9%)**. Current-head CI is tracked separately.

## Inputs and method

- Baseline: `fd6ce69c13daf7aa4eb41b4450382d6370b7993f`; package SHA-256 `c3eaf6e17163b89a9f74e66b8b8c337679d2e2b33eba17bdbc11d466a55af887`. Historical 31abee production work/bytes match this updated baseline.
- Candidate package SHA-256: `ab4765b11ebc7413ec49e8a367cc8f40367ad758e6c7d6c60d6835b4499238d9`.
- Candidate runtime SHA-256: `0994fe76a7dc2af6a056bc5f0321fc6c9038eac791744570b5128efecd4bc1d5`.
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

Historical supplemental coverage on **v3 (`fd3719ab`)**, before the cold error-path ref-detachment fix, showed both ordinary controls entering the root journal. These helper counts were **not rerun for v4**:

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

In that v3 diagnostic, the 256 descendant entries share one capture and commit wave. Full object-journal calls on the parent path fall 12,300→6,156 after whole-record snapshots of unchanged effects are removed. Attempt-local presence stamps now need no undo; property-journal calls are 6,180 for parent updates and 0 for descendants. Calls can deduplicate and are not allocation counts.

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
| root-static-specialized | 37,862 → 47,491 | 13,069 → 16,071 | +3,002 (23.0%) |
| root-static | 117,281 → 136,062 | 37,811 → 43,458 | +5,647 (14.9%) |
| hooks-state | 120,457 → 139,436 | 38,982 → 44,714 | +5,732 (14.7%) |
| component-owned-effects | 118,269 → 137,062 | 38,213 → 43,877 | +5,664 (14.8%) |
| root-descriptor | 117,102 → 135,959 | 37,751 → 43,422 | +5,671 (15.0%) |

All five public oracles pass; Activity stays unreachable in each. The specialized control also excludes list snapshot/restoration, concrete Suspense publication and root-P1 transition helpers. Reusable controls retain root-P1 helpers through already-reachable `startTransition`; concrete `recordSuspenseCommit` is removed. Function-name reachability is diagnostic, not per-helper minified-byte attribution.

Activity App codegen: 2,838→2,866 minified bytes, 1,207→1,221 gzip bytes. RefControl remains 1,965 minified / 903 gzip bytes. Brotli totals are in JSON. No committed minimal bundle ceilings are raised.

## Quiet paired timing

One fresh v4 pair ran pinned baseline then candidate in a coordinated quiet window, after the work/bundle controls closed. No other task builds/tests ran concurrently. JIT is enabled, with three warmups and eight retained samples per operation. Explicit GC, setup, semantic verification and cleanup are outside the timer.

| V4 control | Baseline → candidate score ms | Change | Baseline → candidate median ms | Baseline / candidate RME % |
| --- | ---: | ---: | ---: | ---: |
| plain_updates | 2.00 → 3.36 | +68.0% | 2.10 → 3.50 | 6.2 / 4.3 |
| plain_descendant_updates | 0.32 → 0.36 | +12.5% | 0.30 → 0.40 | 17.1 / 13.8 |

The v4 ordinary parent-update control measures 2.00→3.36ms (+68.0%); median 2.10→3.50ms, p95 2.40→3.70ms. Descendant-only scores are 0.32→0.36ms (+12.5%), with noisy sub-millisecond windows. This is a cold uncaught-error ref-detachment correction, not a performance optimization. Cross-run timing drift prevents attributing differences from v3 to that change; no CPU gain is claimed.

### Preserved v3 timing history

The preceding source (`fd3719ab`) was measured in both sequential orders. Its executable baseline was byte-identical between pairs, but timings drifted substantially; the cause was not established. Those results remain recorded rather than replaced by the latest ratio:

| Recorded v3 order | Ordinary baseline → v3 score ms | Change |
| --- | ---: | ---: |
| baseline → candidate | 2.98 → 6.44 | +116.1% |
| candidate → baseline | 1.84 → 3.58 | +94.6% |

The historical reverse confirmation reused minified assets without rebuilding after a recorded 30-second idle interval. Read-only battery/thermal queries were preserved as endpoint context, not an explanation of drift. No new power diagnostic or profile was run for v4.

The [shared score](../../../benchmarks/lib/stats.mjs) is the latest contiguous five-sample mean within 8% of the best five-sample mean, not the overall eight-sample mean. Median, p95 and RME use all eight. JSON retains all 12 v4 timing windows and every raw sample, plus both full v3 pairs and their context. Raw runner reports retain score-window RME too.

Short descendant windows are quantized and noisy. Within-run RME does not capture cross-run drift, and these control measurements are not a general application slowdown or a confidence interval. Earlier ownerless-descendant results remain superseded by the source-labelled v3 coverage proof.

## Hot-path costs and bounded optimization history

- Each affected root commit wave opens a RootRenderTransaction, flat undo log, touched-object Map, and OffscreenCapture. The capture has eight arrays (effects outer/three inner, events, eventActions, refs, stores), even when empty; there is no buffer/frame pool.
- Each queued origin entering the root window allocates a RootRenderFrame; nested renders within that same active owner reuse the window. The v3 descendant diagnostic entered 256 times while sharing one capture/commit wave.
- The first touched object at a checkpoint copies one own-value snapshot; cold rollback enumerates keys, removes additions, and restores array length separately. Repeated journalObjectOnce calls can deduplicate, so calls are not allocation counts.
- Stable active effects update an attempt-local presence stamp without journaling it; retries mint a fresh version. Whole-record snapshots remain on dependency changes and omitted/reactivated effect paths. Scalar undo uses flat log entries. Structural Maps/Sets, node ranges, closures, and WIP are lazy and tied to actual shape changes.
- The added root entry path does not prewalk the subtree. Owner lookup reads inherited block.idState.renderOwner, now also inherited through lite wrappers. The added retired-subtree ancestry check runs only for a nonempty retired Set; existing effect/Activity ancestry work is not claimed absent.
- Actual component/branch replacement bodies execute once per captured WIP attempt, not an extra preflight followed by a second successful render. Staging still creates blocks and performs real DOM work.

These are source-level allocation observations, not a heap profile or zero-allocation claim. The preserved 9474 candidate measured 1.82→4.04ms (+122.0%) for ordinary parent updates. One-object snapshots (5c2558f3) measured 1.94→3.68ms (+89.7%) in a new pair. Baselines drifted between pairs, so those differences are not isolated causal estimates.

A separate unminified JIT diagnostic of 5c2558f3 (40 operations, 100µs interval) assigned 14.2% of asset self time to `journalObjectOnce` and 11.7% to `journalText`. It exposed 6,144 whole-record journal calls for stable effects and the ownerless descendant path. The next candidate (8d041c13) used scalar effect-stamp undo and fixed lite ownership, measuring 1.96→3.34ms (+70.4%). The v3 candidate removed that attempt-local stamp undo while retaining lifecycle/dependency rollback. V4 only adds cold uncaught-error ref detachment before reporting; its separate measurements above make no CPU gain claim. Historical profiles are not final timing or heap attribution; GC was small only in those sampled windows.

## Reproduction and scope

Use frozen-lockfile dependencies and installed Playwright Chromium. Completed public runner commands:

```bash
BENCH_JSON=/private/tmp/octane-821-perf/baseline-fd6ce69-activity-work.json node benchmarks/activity/work.mjs --target=octane-tsrx --octane-revision=fd6ce69c13daf7aa4eb41b4450382d6370b7993f
BENCH_JSON=/private/tmp/octane-821-perf/baseline-fd6ce69-activity-bundle.json node benchmarks/activity/bundle.mjs --target=octane-tsrx --octane-revision=fd6ce69c13daf7aa4eb41b4450382d6370b7993f
BENCH_JSON=/private/tmp/octane-821-perf/final-v4-activity-work.json node benchmarks/activity/work.mjs --target=octane-tsrx
BENCH_JSON=/private/tmp/octane-821-perf/final-v4-activity-bundle.json node benchmarks/activity/bundle.mjs --target=octane-tsrx
BENCH_JSON=/private/tmp/octane-821-perf/final-v4-root-suspension-work.json node benchmarks/suspense-recovery/root-work.mjs
BENCH_JSON=/private/tmp/octane-821-perf/final-v4-baseline-activity-timing.json node benchmarks/activity/run.mjs 8 --target=octane-tsrx --octane-revision=fd6ce69c13daf7aa4eb41b4450382d6370b7993f
BENCH_JSON=/private/tmp/octane-821-perf/final-v4-activity-timing.json node benchmarks/activity/run.mjs 8 --target=octane-tsrx
```

Raw JSON/logs and supplemental helper/profile scripts are preserved under `/private/tmp/octane-821-perf/` on the audit machine; the JSON lists exact paths. The committed work runners reproduce the primary controls. The failed marker-twin run is retained as failed evidence, not counted as a result.

- The pre-fix no-boundary path is semantically broken, so no suspended-path speed ratio is claimed. The React twin checks observable behavior, not internal work or speed; this is not a React Compiler comparison.
- Named calls and container MutationObserver records do not measure arbitrary allocation, detached-DOM writes, GC pressure or asymptotic scaling. Equal named ordinary counters are not zero overhead.
- Five urgent public-root-render shapes use public use(promise); raw thenables, hydration, transitions, errors, supersession, and universal ownership are regression-suite coverage outside this work measurement.
- The v4 pair is sequential baseline then candidate; historical v3 confirmation reversed order. None uses randomized interleaving. Short descendant windows are timer/noise sensitive, and within-run RME does not cover cross-run baseline drift.
- Node 26.4.0 differs from CI Node 24. Do not ratchet committed bundle budgets from these local results; existing baseline controls already exceed some older ceilings.
- Unminified function-name reachability and the historical CPU sample profile are diagnostics, not exact minified-byte or allocation attribution. Current-head CI is tracked separately.
