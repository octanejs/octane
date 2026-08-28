# Scoped signal engine measurements — 27 August 2026

The final engine run passed all 15 graph/size cases with nine measured samples
and all three continuous ownership cases with 1,000 cycles per sample. At size
10,000, broad updates cost 2.06–3.33 times the raw Alien Signals 3.2.0 control.
Construction and disposal remain substantially more expensive. Continuous
ownership cost stayed roughly flat as unrelated owners grew from zero to
1,000. The final public-entry comparison adds 1,219 gzip bytes to the ordinary
client entry and 393 gzip bytes to the ordinary server entry.

These final runs use frozen source at merged revision
`508f9919f6e4dff8bf13c9fee5447720bd3eb688`, containing upstream release
`97b42683ff64e561638fcc7580ba324e76458244`. The final bundle baseline is that
live upstream revision. Earlier runs below use
`ba9abbfb634786a1b081852f6eb51845f3d588fc` and are preserved as intermediate
evidence. Public-entry bytes happened to be identical between those two
baselines; the final report still records the new archive and exact Git blobs.

The draft subsequently incorporates upstream
`69a56855c21b71f824bdf1064d03e86b0a203eb9`, adding unrelated Inferno benchmark
targets and workspace metadata. No measured source changed; its hashes were
checked again after integration. The recorded measurement revision, baseline,
and lockfile hash below remain the actual inputs to the run.

## Final engine timing

[engine-final.json](engine-final.json) and [engine-final.log](engine-final.log)
record the complete run. The options exactly match the earlier full runs:
sizes 100/1,000/10,000; five graph shapes; two warmups and nine measured samples;
32 operations per update sample; 1,000 continuous disposal cycles; and
0/100/1,000 unrelated owners. The workload hash and raw Alien bundle hash are
unchanged. The runner's only change from the earlier timing runner is JSON
report indentation. Other test/build jobs were paused during CPU measurement.

All 36 target rows passed their value, notification, ownership, and stack
checks. Times below are medians in milliseconds at size 10,000. Size means
rows or links; actual source/derived-node counts differ by shape and are
recorded in JSON. RME is the relative margin of error for the mean, not a
confidence interval for a median or ratio.

| Graph                | Raw broad update | Scoped broad update | Scoped / raw | Raw / scoped RME |
| -------------------- | ---------------: | ------------------: | -----------: | ---------------: |
| Independent          |            0.980 |               3.267 |        3.33× |      5.8% / 5.2% |
| Fanout               |            0.808 |               2.362 |        2.92× |      5.4% / 6.1% |
| Chain                |            0.389 |               0.800 |        2.06× |      8.9% / 5.3% |
| Diamond              |            1.974 |               5.442 |        2.76× |     13.8% / 9.8% |
| Dynamic dependencies |            1.031 |               2.487 |        2.41× |     9.9% / 10.2% |

| Graph at size 10,000 | Construction ratio | Construction RME, raw / scoped | Disposal ratio | Disposal RME, raw / scoped |
| -------------------- | -----------------: | -----------------------------: | -------------: | -------------------------: |
| Independent          |             13.84× |                   18.2% / 8.0% |          3.83× |              19.0% / 14.8% |
| Fanout               |              9.28× |                   23.5% / 6.2% |          4.28× |               13.4% / 6.3% |
| Chain                |             17.50× |                    2.3% / 9.3% |          4.55× |               5.9% / 15.6% |
| Diamond              |             10.69× |                    7.0% / 8.0% |          5.72× |              25.3% / 17.5% |
| Dynamic dependencies |              4.65× |                   36.4% / 6.6% |          5.58× |              18.1% / 38.2% |

The ownership layer has a clear cost relative to the raw graph API. Several
construction, disposal, and tiny-operation measurements have substantial
variance; their point ratios are not precise thresholds. Absolute timings of
both controls also differ from earlier processes, so cross-run differences
cannot be attributed entirely to source changes. No timing threshold or
performance-win claim is introduced by this experiment.

| Unrelated owners | Raw median µs/cycle | Scoped median µs/cycle | Scoped / raw | Raw / scoped RME |
| ---------------- | ------------------: | ---------------------: | -----------: | ---------------: |
| 0                |               17.52 |                  96.91 |        5.53× |      6.2% / 3.2% |
| 100              |               17.93 |                  94.16 |        5.25× |      6.5% / 1.9% |
| 1,000            |               17.39 |                  94.00 |        5.40× |      7.3% / 1.8% |

Each cycle creates two owners with 32 derived consumers each, updates the
shared producer, retires each owner in turn, and verifies surviving consumers
and the still-live producer. No retired or unrelated consumer was notified.
The roughly flat cost supports bounded affected-owner work for these tested
graphs; it is not a browser-frame or unlimited-scale guarantee.

The final timing bundle is exactly the bundle exercised by the final async
retention run, including cancellation-reentrancy and iterator-close fixes:

- Scoped bundle: `6307962f65d1f6a23339e6f53555871002a110b194406a2e0a53ea301850a79f`
- Raw Alien bundle: `3e2f75ec8fdc63f84a2d0b1b15f24c216390d8277bc81c2023990b3a02336d33`
- Workload: `e8b48017058ff7b37b35b1632b0e1679a727665f508e53aaeeb2c44877dc3e07`
- Runner: `a011e8a67167b4e7ac14f031fceb84e92242ecbe580333e4964218b955b8f8d3`
- Frozen lockfile: `b16bea53c010a4ab4a3b63511b5c0dff0f96c5623d9c53b4a21e1f11ad05e72e`

Every measured engine input was checked against disk after timing; no source
drift occurred. The formatted report SHA-256 is
`40613c171569e7264e345e49a54235c8d7635e2877e77560237f738bf34cc393`.
[engine-final-format-provenance.json](engine-final-format-provenance.json)
preserves the raw-run hash and records unchanged parsed values after JSON
formatting, matching workload/options/raw bundle, and the identical final
retention bundle.

## Final bundle and retention evidence

[bundles-final.json](bundles-final.json) and
[bundles-final.md](bundles-final.md) record seven public source-entry builds
against `97b42683ff64e561638fcc7580ba324e76458244`. All complete-graph boundary
and export-loading checks pass. The ordinary entries resolve neither Alien
nor the scoped engine; the independent engine resolves no renderer, compiler,
React, or DevTools. Optional hook entries use the pinned Alien 3.2.0 package.

| Public entry                                 | Baseline raw / gzip / Brotli | Candidate raw / gzip / Brotli |    Gzip change |
| -------------------------------------------- | ---------------------------: | ----------------------------: | -------------: |
| `createRoot` from `octane`                   |    132,788 / 42,785 / 37,608 |     136,080 / 44,004 / 38,566 | +1,219 (2.85%) |
| `renderToString` from `octane/server`        |     33,167 / 11,853 / 10,736 |      34,222 / 12,246 / 11,066 |   +393 (3.32%) |
| `createScope`, `query` from `octane/signals` |                            — |        28,792 / 9,193 / 8,339 |              — |
| `useSignal$` from `octane/signals/client`    |                            — |       30,464 / 10,057 / 9,086 |              — |
| `useSignal$` from `octane/signals/server`    |                            — |        29,556 / 9,562 / 8,688 |              — |

The archive, manifests, Git-blob checks, and all exact source hashes are in
the report. The source hashes include client runtime
`72d8c0efdb97e7763b2cfa7e74a13e8c24bd57a48b2b19aed121f17bd0537d49`, server
runtime `66d094c2ab47ae21c85a7d62c328edafa4230d8a778afa37a563759029360803`,
graph `719371959354ca916d11a76bb162eac93fb4efacf056d14290d5768bfe9dc3a5`,
engine `18eb70cbf0e4e44affa31adbf61d4adbfdfb1965aa975803e14f2ee3df2ac729`,
and requests `71c13917b62d698b96fd74fbe23ac60fa8eae2c4515bb72b804c89693efd4a2a`.
The formatted bundle report hash is
`1094bfd0c1707535cbd508619133b9c8dede3b180a62e0fc624f23b7fa7dd16c`.
Its raw conservative `preliminary` status is preserved; the final-source
invocation is identified in its note and formatting-provenance sidecar.

[async-retention-final.json](async-retention-final.json) and
[async-retention.md](async-retention.md) record real GC/retainer checks of the
same engine bundle. After 2,000 owner disposals, only the positive control's
scope, four nodes, two requests, and iterator remained. After retiring that
control all those counts were zero, despite 3,003 externally retained pending
promises. Revoked attempt shells released their entry/controller/iterator and
disappeared after the external promises were dropped. The original iterator
leak and its before/after paths remain documented, not overwritten.

These are bounded Node engine and source-entry measurements. Optional hook
byte totals are separate exports, not incremental app costs. They do not
replace compiled `.tsrx`, application bundle, real-browser, hydration,
native-consumer memory, DevTools memory, or current-head CI gates. The separate
[native-dom-abi-final.json](native-dom-abi-final.json) report supplies native
source ABI evidence; its 27 cases already include the five supersession
controls and must not be counted as 32 distinct tests.

## Earlier engine runs

Both complete runs passed all semantic controls at graph sizes 100, 1,000, and
10,000 and through 1,000 continuous disposal cycles. The scoped engine remains
substantially more expensive than the raw Alien 3.2.0 graph. Its continuous
ownership cost stayed roughly constant as unrelated owners increased from zero
to 1,000. These results cover synchronous data ownership; they do not qualify
native rendering, compiler behavior, SSR, hydration, async-attempt retention,
or default-runtime overhead.

The first run is preserved in [engine-full.json](engine-full.json). After
snapshot freezing was moved to public exposure and an unused per-node retry
closure was removed, the identical command produced
[engine-refined.json](engine-refined.json). Both used the same runner, workload,
and raw Alien bundle hashes. Their scoped bundle hashes differ, and every
bundled source input is fingerprinted in its report. Both were measured from an
uncommitted experiment based on `ba9abbfb634786a1b081852f6eb51845f3d588fc`.

The environment was Node 26.4.0 on macOS arm64, Apple M5 Max, with esbuild 0.28.1
and Alien Signals 3.2.0. An explicit isolated tooling installation was used
because the complete workspace's `@tsrx/*` dependencies could not be fetched.
The actual `octane/signals` export was bundled; no replacement engine, renderer,
compiler, React package, or DevTools implementation entered either measurement.

## Earlier refined timing results

Each graph has two warmups and nine measured samples, reversing target order
between samples. Each update sample averages 32 operations; value and subscriber
checks run outside the timed region after every operation. Times below are
medians in milliseconds at size 10,000. RME is the runner's relative margin of
error for the mean, not a confidence interval on the median ratio.

| Graph                | Raw broad update | Scoped broad update | Scoped / raw | Raw / scoped RME |
| -------------------- | ---------------: | ------------------: | -----------: | ---------------: |
| Independent          |            0.722 |               2.713 |        3.76× |      4.0% / 5.8% |
| Fanout               |            0.606 |               2.003 |        3.31× |     19.6% / 4.5% |
| Chain                |            0.279 |               0.643 |        2.30× |     5.4% / 10.1% |
| Diamond              |            1.449 |               4.542 |        3.13× |     19.4% / 8.5% |
| Dynamic dependencies |            0.735 |               2.197 |        2.99× |      8.4% / 3.2% |

The size parameter denotes rows or links, not equal node counts across shapes.
The JSON reports include actual node/output counts and all other operations,
including sparse writes, cached reads, equal writes, dependency switches,
construction, and disposal.

| Graph at size 10,000 | First construction ratio | Refined construction ratio | First disposal ratio | Refined disposal ratio |
| -------------------- | -----------------------: | -------------------------: | -------------------: | ---------------------: |
| Independent          |                   15.59× |                     14.77× |                5.93× |                  4.42× |
| Fanout               |                    8.54× |                      8.89× |                5.45× |                  3.64× |
| Chain                |                   16.55× |                     16.87× |                8.84× |                  4.42× |
| Diamond              |                    9.90× |                     10.68× |               11.69× |                  5.84× |
| Dynamic dependencies |                    7.00× |                      4.14× |                5.16× |                  4.48× |

Construction remains a clear cost of the ownership layer. The reduced disposal
ratios are promising, but the raw control also became faster between processes.
Do not attribute every absolute timing reduction to the code changes. Several
construction and tiny-operation measurements have high variance; repeat runs
are needed before adopting timing thresholds or claiming precise improvements.

Each continuous cycle creates two owners with 32 derived consumers each, writes
their shared producer, disposes one owner, writes again, disposes the second,
and writes again. The shared owner remains alive between cycles. Verification,
checkpoint work, and repeated idempotence checks are outside the timer.

| Unrelated owners | Raw median µs/cycle | Scoped median µs/cycle | Scoped / raw | Raw / scoped RME |
| ---------------- | ------------------: | ---------------------: | -----------: | ---------------: |
| 0                |               14.10 |                  77.19 |        5.48× |     11.6% / 2.1% |
| 100              |               14.87 |                  78.32 |        5.27× |      4.9% / 1.3% |
| 1,000            |               14.33 |                  78.28 |        5.46× |      6.1% / 0.9% |

No disposed consumer received a later notification, no unrelated graph was
notified, and surviving consumers remained current. A 10,000-link chain
completed without a stack failure. These controls establish behavior at the
tested sizes, not an unlimited supported depth or a browser-frame budget.

## Memory diagnostics on the first engine version

[engine-heap.json](engine-heap.json) records a separate run with explicit GC;
its scoped bundle hash matches the first timing run. No GC-run timing is used
above. With zero unrelated owners, scoped post-GC `heapUsed` was 8.31 MB at
cycle zero, 8.42 MB after 1,000 cycles, and 8.31 MB after shared-owner retirement.
With 1,000 unrelated owners those values were 11.25 MB, 11.36 MB, and 8.42 MB.
Values are decimal MB. RSS and V8 heap reservation grew substantially despite
the release of live JS heap, so allocation pressure remains a practical concern.

[engine-retainers.json](engine-retainers.json) records a separate snapshot run
of that same engine bundle. The raw V8 files stay outside the repository under
`/private/tmp/octane-scoped-signals-retainers-20260827`, because heap snapshots
can contain process values. The reproducible offline inspection is
[inspect-retainers.mjs](inspect-retainers.mjs), with results in
[engine-retainer-analysis.json](engine-retainer-analysis.json).

The scanner identifies Scope instances through their public prototype surface,
then follows strong root paths while excluding weak edges. The initial live
shared owner is a positive control, so a broken scanner that returns zero for
every snapshot would fail. For this recorded source revision it uses the stored
key behind the `scopeKey` getter to distinguish workload owners; that field is
not a correctness assertion in the public test suites.

| Checkpoint                      | Disposed cycle owners so far | Strongly retained Scope instances |
| ------------------------------- | ---------------------------: | --------------------------------: |
| Cycle 0, shared owner alive     |                            0 |                   1: shared owner |
| Cycle 100, shared owner alive   |                          200 |                   1: shared owner |
| Cycle 1,000, shared owner alive |                        2,000 |                   1: shared owner |
| After shared-owner retirement   |                        2,000 |                                 0 |

This supports bounded owner retention for this synchronous workload. It does
not prove cleanup of unresolved async producers, historical frames, DOM,
native renderer consumers, or DevTools. The refined engine has not received a
second heap/snapshot run in these reports.

## Commands

Run from the repository root. Use new result names for further measurements
so the recorded evidence remains unchanged.

```bash
BENCH_JSON=benchmarks/scoped-signals/results/2026-08-27/engine-final.json node benchmarks/scoped-signals/run.mjs --tooling-root=/private/tmp/octane-scoped-signals-tooling.n1e5b0
BENCH_JSON=benchmarks/scoped-signals/results/2026-08-27/bundles-final.json node benchmarks/scoped-signals/run-bundles.mjs --baseline-ref=97b42683ff64e561638fcc7580ba324e76458244 --baseline-package=/private/tmp/octane-scoped-bundle-baseline-final.BIvoPy/packages/octane --tooling-root=/private/tmp/octane-scoped-signals-tooling.n1e5b0
BENCH_JSON=benchmarks/scoped-signals/results/2026-08-27/engine-full.json node benchmarks/scoped-signals/run.mjs --tooling-root=/private/tmp/octane-scoped-signals-tooling.n1e5b0
BENCH_JSON=benchmarks/scoped-signals/results/2026-08-27/engine-refined.json node benchmarks/scoped-signals/run.mjs --tooling-root=/private/tmp/octane-scoped-signals-tooling.n1e5b0
BENCH_JSON=benchmarks/scoped-signals/results/2026-08-27/engine-heap.json node --expose-gc benchmarks/scoped-signals/run.mjs 1 --heap --cycles=1000 --unrelated=0,100,1000 --tooling-root=/private/tmp/octane-scoped-signals-tooling.n1e5b0
BENCH_JSON=benchmarks/scoped-signals/results/2026-08-27/engine-retainers.json node --expose-gc benchmarks/scoped-signals/run.mjs 1 --heap --cycles=1000 --unrelated=0 --snapshots=/private/tmp/octane-scoped-signals-retainers-20260827 --tooling-root=/private/tmp/octane-scoped-signals-tooling.n1e5b0
node benchmarks/scoped-signals/results/2026-08-27/inspect-retainers.mjs
```

The adjacent `.log` files preserve all runner completion messages. No semantic
or stack failure was suppressed, and no workload was reduced to obtain these
full-run results. The earlier small smoke run was not used in the comparisons.
