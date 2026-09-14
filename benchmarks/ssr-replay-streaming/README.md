# SSR replay snapshots and streaming settlements

This suite measures two costs from issue #981 through production server bundles:
copying populated resource collections before each component, and creating new
settlement recorders for promises that remain pending across streaming waves.

```sh
node benchmarks/bench.mjs --quick --ratios ssr-replay-streaming
SSR_SOURCE_ROOT=/path/to/baseline node benchmarks/bench.mjs --quick --ratios ssr-replay-streaming
```

The baseline can be a frozen source archive. Both runs use this checkout's
compiler, fixtures, dependencies, and instrumentation. `BENCH_JSON` on either
individual script writes the standard benchmark schema. Source, bundle,
environment, and output hashes are included in individual results.

## Work and semantic controls

`snapshots.mjs` counts actual nonempty Map/Set copies and entries copied by the
replay helpers. It separately counts list snapshots. The fixture seeds 32 CSS
and resource-hint groups, then renders unchanged or resource-writing descendants.
Empty collectors, the growing prefix alone, and a nested synchronous stream are
controls. Clean and observed bundles must produce identical complete HTML/CSS;
the fixture checks resource order, resources, CSS and leaf output.

`streaming.mjs` counts actual recorder starts, `Promise.race` reactions, and
subscriptions on public thenables. It includes both a compiled component with
batched reads and a plain JavaScript component. The consumer accepts a chunk
before releasing the next reverse-ordered group: no data timers decide wave
boundaries. Complete values, reveal order and chunk counts must match between
clean and observed bundles. `SSR_BASELINE_ROOT=/path/to/baseline` additionally
compares baseline/candidate semantic records and one-wave controls in one run.

The operation observers are absent from clean bundles. Counts measure removed
work; they are not V8 heap-allocation or application-throughput measurements.

## Baseline and candidate

Baseline: main `7d4dc4f51fb1e97203fdcfe2a05d8b5a3e27ab6c`, Node 24.20.0,
V8 13.6.233.17, macOS arm64. The final candidate passes 28 deterministic ratio
guards; the original baseline breaches the guards for repeated copies and
subscriptions.

| Scenario | Baseline | Candidate |
| --- | ---: | ---: |
| 32 resource groups + 128 unchanged leaves: Map/Set copies | 795 | 160 |
| Same: entries copied | 36,736 | 4,224 |
| Growing resource prefix alone: copies / entries | 155 / 3,968 | 155 / 3,968 |
| 128 head-writing leaves: copies / entries | 795 / 61,120 | 668 / 57,056 |
| Nested synchronous stream: copies / entries | 235 / 8,064 | 160 / 4,224 |
| Nested synchronous stream: list copies / entries | 98 / 98 | 98 / 98 |
| Empty resource collections: copies | 0 | 0 |
| 32 producers in 32 waves: recorder starts | 528 | 32 |
| Same: public thenable subscriptions, including read probes | 1,056 | 560 |
| Same: recorder race reactions | 528 | 0 |
| 32 producers in one wave: recorders / public subscriptions | 32 / 64 | 32 / 64 |

Compiled and plain JavaScript streaming controls have the same work counts.
All five snapshot output hashes match the baseline. Streaming semantic hashes
and the unchanged one-wave controls match as well.

## Lifetime and alternatives

Each existing CSS/head collector gets one nullable cache pointer. A populated
generation copies the collections once, and unchanged descendants reuse those
pristine copies. Authored writes and rewinds invalidate the cache; ancestor
snapshots remain immutable for repeated rollback. Resource coercion can render
children, so stylesheet insertion invalidates again after user code. Full-pass
cleanup drops memo copies after disposal callbacks, including when the live CSS
Map escapes in a hosted result. No cache crosses request boundaries.

Length/size checkpoints cannot restore overwritten CSS or preload-to-preinit
deletions and option transfers. A mutation journal would require more state
and bookkeeping at every write. Write-heavy generations still copy; the suite
reports that limit rather than hiding it behind unchanged-tree measurements.

A streaming request allocates its registry only when it settles suspended work.
Each pending producer has one recorder and the occurrence keys needed to record
first-writer outcomes. Additional keys allocate a Set only when required (for
example, fresh compiler batch keys). Each wave has one wake promise, and only
producers observed in that wave may wake it. Completion, error and abort detach
the registry from request state and drop additional keys; late outcomes are
consumed without retaining or refilling the request or cancelling shared work.

This does not eliminate suspended-list scans, ordinary read probes, synthetic
key storage, or repeated full rendering. The 560 remaining subscriptions in the
32-wave case include those read probes. Reuse by string key alone was rejected
because compiled batches issue fresh keys on each pass.

## Optional latency measurements

```sh
SSR_BASELINE_ROOT=/path/to/baseline node benchmarks/ssr-replay-streaming/timing.mjs
SNAPSHOT_TIMING=1 node benchmarks/ssr-replay-streaming/snapshots.mjs
```

`timing.mjs` compiles the existing streaming storefront, uses unobserved server
bundles, and alternates baseline/candidate order. Each case gets 10 warmups and
31 samples. The 10/100/800-card cases resolve in one wave; 50 cards resolve in
groups of five. The full response must match after normalizing observed request
boundary IDs. Timed callbacks only count bytes/chunks; assertions and response
parsing run outside the timing. Samples, source/bundle hashes, raw/gzip bundle
sizes, byte counts and chunk counts are recorded. Run without concurrent builds
or tests and interpret deltas within sample variation as inconclusive.

`SNAPSHOT_TIMING=1` measures unobserved synchronous responses with 30 warmups
and 31 samples of eight renders. Keep baseline/candidate command settings and
run order controlled; these optional timings are not CI ratio gates.

### Recorded final measurements

The [recorded data](./measurements.json) includes hashes and streaming samples.
The runtime source hash was
`47649d48f930f3c19648943a5f05cbfb454a35feadfdfe5495e6a985e20cc881`.

| Storefront cards / wave size | Baseline median, ms | Candidate median, ms |
| --- | ---: | ---: |
| 10 / 10 | 0.231 | 0.242 |
| 100 / 100 | 1.075 | 1.098 |
| 800 / 800 | 9.248 | 9.243 |
| 50 / 5 | 1.620 | 1.622 |

These distributions overlap; no storefront latency improvement is claimed.
The compiled storefront bundle grows from 63,229 to 64,394 minified bytes
(+1,165), and 22,112 to 22,471 gzip bytes (+359). This is the cost of both changes
together in that fixture, not a universal package-size delta.

Snapshot runs in baseline–candidate–candidate–baseline order show a clear gain
for unchanged populated resources: baseline medians 0.740/0.712 ms, candidate
0.207/0.205 ms. Empty medians remain 0.074–0.077 ms; growing-prefix medians
0.139–0.155 ms. Changing-head medians are 1.267–1.314 ms on baseline and
1.184–1.249 ms on candidate; no broader throughput claim follows from these
focused fixtures. The deterministic counts remain the CI gate.
