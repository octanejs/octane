# Scoped signal engine measurements — 27 August 2026

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

## Refined timing results

Each graph has two warmups and nine measured samples, reversing target order
between samples. Each update sample averages 32 operations; value and subscriber
checks run outside the timed region after every operation. Times below are
medians in milliseconds at size 10,000. RME is the runner's relative margin of
error for the mean, not a confidence interval on the median ratio.

| Graph | Raw broad update | Scoped broad update | Scoped / raw | Raw / scoped RME |
| --- | ---: | ---: | ---: | ---: |
| Independent | 0.722 | 2.713 | 3.76× | 4.0% / 5.8% |
| Fanout | 0.606 | 2.003 | 3.31× | 19.6% / 4.5% |
| Chain | 0.279 | 0.643 | 2.30× | 5.4% / 10.1% |
| Diamond | 1.449 | 4.542 | 3.13× | 19.4% / 8.5% |
| Dynamic dependencies | 0.735 | 2.197 | 2.99× | 8.4% / 3.2% |

The size parameter denotes rows or links, not equal node counts across shapes.
The JSON reports include actual node/output counts and all other operations,
including sparse writes, cached reads, equal writes, dependency switches,
construction, and disposal.

| Graph at size 10,000 | First construction ratio | Refined construction ratio | First disposal ratio | Refined disposal ratio |
| --- | ---: | ---: | ---: | ---: |
| Independent | 15.59× | 14.77× | 5.93× | 4.42× |
| Fanout | 8.54× | 8.89× | 5.45× | 3.64× |
| Chain | 16.55× | 16.87× | 8.84× | 4.42× |
| Diamond | 9.90× | 10.68× | 11.69× | 5.84× |
| Dynamic dependencies | 7.00× | 4.14× | 5.16× | 4.48× |

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
| --- | ---: | ---: | ---: | ---: |
| 0 | 14.10 | 77.19 | 5.48× | 11.6% / 2.1% |
| 100 | 14.87 | 78.32 | 5.27× | 4.9% / 1.3% |
| 1,000 | 14.33 | 78.28 | 5.46× | 6.1% / 0.9% |

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

| Checkpoint | Disposed cycle owners so far | Strongly retained Scope instances |
| --- | ---: | ---: |
| Cycle 0, shared owner alive | 0 | 1: shared owner |
| Cycle 100, shared owner alive | 200 | 1: shared owner |
| Cycle 1,000, shared owner alive | 2,000 | 1: shared owner |
| After shared-owner retirement | 2,000 | 0 |

This supports bounded owner retention for this synchronous workload. It does
not prove cleanup of unresolved async producers, historical frames, DOM,
native renderer consumers, or DevTools. The refined engine has not received a
second heap/snapshot run in these reports.

## Commands

Run from the repository root. Use new result names for further measurements
so the recorded evidence remains unchanged.

```bash
BENCH_JSON=benchmarks/scoped-signals/results/2026-08-27/engine-full.json node benchmarks/scoped-signals/run.mjs --tooling-root=/private/tmp/octane-scoped-signals-tooling.n1e5b0
BENCH_JSON=benchmarks/scoped-signals/results/2026-08-27/engine-refined.json node benchmarks/scoped-signals/run.mjs --tooling-root=/private/tmp/octane-scoped-signals-tooling.n1e5b0
BENCH_JSON=benchmarks/scoped-signals/results/2026-08-27/engine-heap.json node --expose-gc benchmarks/scoped-signals/run.mjs 1 --heap --cycles=1000 --unrelated=0,100,1000 --tooling-root=/private/tmp/octane-scoped-signals-tooling.n1e5b0
BENCH_JSON=benchmarks/scoped-signals/results/2026-08-27/engine-retainers.json node --expose-gc benchmarks/scoped-signals/run.mjs 1 --heap --cycles=1000 --unrelated=0 --snapshots=/private/tmp/octane-scoped-signals-retainers-20260827 --tooling-root=/private/tmp/octane-scoped-signals-tooling.n1e5b0
node benchmarks/scoped-signals/results/2026-08-27/inspect-retainers.mjs
```

The adjacent `.log` files preserve all runner completion messages. No semantic
or stack failure was suppressed, and no workload was reduced to obtain these
full-run results. The earlier small smoke run was not used in the comparisons.
