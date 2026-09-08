# Native TSRX consolidation: measured costs and retention

The primary experiment is authored `.tsrx` compiled `@{}` output. Native reads, output identity, teardown, and inferred `use()` caching pass their controls. Most template timing comparisons remain inconclusive within their reported uncertainty; the prop update with one signal read is higher in this run. The measurements do not establish zero overhead.

The comparison uses the exact archived `cd9ed33754bfc3eeb144ba256dc9b437614e3e92` sources and the consolidated sources identified by the input hashes. Both use production compilation, the same fixture, and the same dependencies. The candidate was uncommitted during measurement. These are supplemental public source results, not a locked workspace or CI qualification. Compiler provenance is recorded in [source validation](consolidation-source-validation.json). The result JSON files contain commands, timing summaries, native raw samples, and generated code, bundle, and source hashes.

## Compiled `@{}` TSRX

The [fixture](../../native-costs.tsrx) uses two unread controls and one, repeated, or distinct signal reads. The [matched run](consolidation-native-costs.json) has two warmups and nine measured samples, reversing case order on alternate samples. Each sample measures 64 mounts, 2,000 prop updates, 2,000 signal updates where applicable, and 1,000 server renders. Each case has a separate bundled runtime so an enabled case cannot activate a disabled control.

Times below are arithmetic means over all nine samples. The relative margins use the shared 95% Student t calculation. Overlap means the run cannot distinguish a change; a separated interval is a measurement to investigate, not a universal bound. These are synchronous happy-dom renderer costs, with no layout, paint, frame, or browser hydration timing.

| Case / operation | Baseline µs ±95% RME | Candidate µs ±95% RME | Ratio | Intervals |
| --- | --- | --- | --- | --- |
| Unread, native disabled: mount | 4.367 ±12.1% | 4.922 ±21.5% | 1.13× | overlap |
| Unread, native disabled: prop update | 1.084 ±7.4% | 1.630 ±60.6% | 1.50× | overlap |
| Unread, native disabled: SSR | 0.555 ±33.4% | 0.661 ±51.1% | 1.19× | overlap |
| Unread, native enabled: mount | 4.626 ±8.8% | 4.809 ±23.3% | 1.04× | overlap |
| Unread, native enabled: prop update | 1.351 ±18.9% | 1.356 ±22.2% | 1.00× | overlap |
| Unread, native enabled: SSR | 0.740 ±32.1% | 1.256 ±74.7% | 1.70× | overlap |
| One signal read: mount | 5.631 ±20.3% | 5.553 ±9.3% | 0.99× | overlap |
| One signal read: prop update | 1.591 ±10.3% | 2.045 ±13.0% | 1.29× | higher, separate |
| One signal read: signal update | 0.988 ±15.1% | 1.133 ±45.1% | 1.15× | overlap |
| One signal read: SSR | 2.521 ±18.5% | 2.153 ±22.0% | 0.85× | overlap |
| 16 reads of one signal: mount | 5.962 ±26.5% | 5.424 ±9.3% | 0.91× | overlap |
| 16 reads of one signal: prop update | 1.927 ±3.8% | 1.828 ±15.9% | 0.95× | overlap |
| 16 reads of one signal: signal update | 1.335 ±14.9% | 1.468 ±34.1% | 1.10× | overlap |
| 16 reads of one signal: SSR | 2.376 ±21.7% | 2.675 ±16.0% | 1.13× | overlap |
| 16 distinct signals: mount | 6.552 ±8.6% | 6.487 ±9.5% | 0.99× | overlap |
| 16 distinct signals: prop update | 2.368 ±7.4% | 2.430 ±5.9% | 1.03× | overlap |
| 16 distinct signals: signal update | 3.322 ±5.8% | 3.352 ±5.0% | 1.01× | overlap |
| 16 distinct signals: SSR | 7.053 ±8.8% | 7.363 ±6.0% | 1.04× | overlap |

The prop update with one signal read is 1.591 → 2.045 µs (+28.6%, about 0.454 µs); its intervals narrowly separate. All other primary mount, prop, signal, SSR, and unmount comparisons overlap (22/23 cells). The candidate unread enabled/disabled comparisons also overlap. In particular, noisy unread SSR does not establish free collection or a speedup.

Visible output and the same host node are checked after each measured update phase. The producer remains writable after unmount without reviving the DOM. A component with the `use(make$(a, b, c, d, e))` hook displays the expected value after every update: 1 factory call on mount, 0 calls across 32 cache hits, and 32 calls across 32 misses that change the five dependencies in turn. Both baseline/candidate and disabled/enabled modes pass. The two new ratio guards pass against those recorded targets. Factory calls measure deterministic work, not V8 allocations. Semantic controls do not depend on private compiler helper names.

Real Chromium development/production checks are separate from timing. The [browser fixture](../../../../packages/octane/tests/browser/signals-native-collection/signals-native-collection.test.ts) covers native events, focus/selection, surviving DOM identity, indirect returns, parameter reads, inferred memo updates, reader remounts, and producer lifetime; its ordinary native-disabled companion is a control. Their final audited results belong to [source validation](consolidation-source-validation.json), not the happy-dom timing lane.

## Unused native code in ordinary bundles

The first bundle measurement exposed an avoidable reference from ordinary runtime work into the adapter factory. That run and its [metafile regression control](consolidation-bundle-boundary-red.json) are preserved. The strengthened guard rejects even 1 retained byte of the concrete native client/server adapters, collector, inspection, or retry implementation, and rejects missing emitted-byte evidence. Archived ordinary entries pass; both entries before the fix fail. After the runtime correction, all final ordinary entries contain 0 emitted bytes from those implementations.

The [final public entry bundles](consolidation-bundles.json) still have a small integration cost: client gzip +130 bytes (0.30%), server gzip +94 bytes (0.77%). Read/event protocol seams and the server empty seed map remain measured separately. The existing exclusion of Alien and the scoped engine from the complete ordinary import graph remains intact.

| Public entry | Raw bytes | gzip-9 bytes | Brotli-11 bytes |
| --- | --- | --- | --- |
| baseline/ordinary-client | 136,080 | 44,004 | 38,566 |
| candidate/ordinary-client | 136,410 | 44,134 | 38,712 |
| baseline/ordinary-server | 34,222 | 12,246 | 11,066 |
| candidate/ordinary-server | 34,412 | 12,340 | 11,173 |
| candidate/engine | 30,197 | 9,628 | 8,730 |
| candidate/native-client | 31,868 | 10,518 | 9,518 |
| candidate/native-server | 30,960 | 10,001 | 9,096 |

These retain named public exports, not complete applications. The independent engine and optional hook entries are not incremental app costs. All seven boundary and export loading controls pass, and no measured source changed. The [bundle result before the fix](consolidation-bundles-before-reachability-fix.json) records client/server gzip 44,004 → 46,699 and 12,246 → 13,869 bytes; the corrected sizes above supersede those measurements. The earlier [native timing diagnostic](consolidation-native-costs-before-reachability-fix.json) is also retained. Both its baseline and candidate absolute times differ from the final run, so they do not establish a global speedup caused by the reachability correction.

## Collector protocol cost

The same matched run separately measures 100,000 cycles of begin/end, 16 repeated or distinct reads, four nested witnesses, or replay. Observer and write guard restoration, callback counts, and witness invalidation are checked outside timing. This direct protocol microbenchmark supplements the compiled TSRX cases; it is not a substitute for renderer work.

| Collector case | Baseline ns ±95% RME | Candidate ns ±95% RME | Ratio | Intervals |
| --- | --- | --- | --- | --- |
| empty | 26.887 ±1.9% | 31.391 ±3.1% | 1.17× | higher, separate |
| repeated | 104.127 ±2.1% | 109.394 ±0.9% | 1.05× | higher, separate |
| distinct | 109.199 ±0.4% | 117.042 ±1.4% | 1.07× | higher, separate |
| nested-witness | 1188.115 ±2.5% | 1179.994 ±2.2% | 0.99× | overlap |
| replay | 113.649 ±12.6% | 118.096 ±15.2% | 1.04× | overlap |

Empty/repeated/distinct collection is higher in this run, while nested witnesses and replay overlap. The absolute increases are several nanoseconds per measured collector cycle; no allocation or browser performance claim follows.

## Ownership graph and repeated lifetimes

The [archived engine](consolidation-engine-baseline.json) and [candidate engine](consolidation-engine-current.json) each pass all five graph shapes at workload scales 100/1,000/10,000, plus 1,000 consecutive ownership cycles with 0/100/1,000 unrelated owners. The scale is a workload parameter, not a universal node count. Output, batching, public notification counts, and late notification controls agree. The raw Alien 3.2.0 comparator bundle is byte-identical in both runs. Graph timing uses the existing shared late-window score and its reported margin, unlike the native mean over all samples.

An initial run hit the default Node stack limit during raw Alien teardown of the 10,000-deep chain. Its [failed artifact](consolidation-engine-baseline-stack-failure.json) remains a failure. Both matched full graph runs then used the same explicit `node --stack-size=8192` setting, recorded in their commands. This does not establish safety with the default stack or in a browser at that depth. The native rendering benchmark kept its original default stack.

Of the 96 scoped graph/cycle scores, 85 intervals overlap. The following are every separated comparison, including both increases and decreases. This single local run does not establish general improvement, and the comparisons have no adjustment for multiple testing:

| Case / operation | Baseline µs ±95% RME | Candidate µs ±95% RME | Ratio | Intervals |
| --- | --- | --- | --- | --- |
| independent-1000: read_cached | 0.470 ±15.6% | 0.264 ±22.7% | 0.56× | lower, separate |
| independent-1000: write_sparse | 2.940 ±14.7% | 1.470 ±32.8% | 0.50× | lower, separate |
| fanout-100: write_equal | 0.170 ±19.9% | 0.114 ±10.2% | 0.67× | lower, separate |
| chain-100: read_cached | 0.088 ±9.0% | 0.105 ±5.5% | 1.20× | higher, separate |
| chain-100: batch_write_all | 11.935 ±14.3% | 17.066 ±15.6% | 1.43× | higher, separate |
| chain-1000: read_cached | 0.093 ±7.2% | 0.130 ±9.5% | 1.39× | higher, separate |
| chain-10000: batch_write_all | 1273.947 ±5.1% | 1513.834 ±6.3% | 1.19× | higher, separate |
| dynamic-100: create | 450.083 ±18.4% | 287.442 ±19.1% | 0.64× | lower, separate |
| dynamic-100: write_sparse | 46.515 ±11.2% | 37.366 ±8.5% | 0.80× | lower, separate |
| dynamic-100: switch_dependency | 51.801 ±13.8% | 39.945 ±6.4% | 0.77× | lower, separate |
| continuous-1000: cycle | 158.554 ±2.0% | 169.583 ±3.2% | 1.07× | higher, separate |

At the largest scale, the chain batch update rises 1.274 → 1.514 ms (+18.8%). Continuous lifetime cost at 1,000 unrelated owners rises 158.554 → 169.583 µs (+7.0%). As the unrelated owner count increases, candidate cycle cost does not grow:

| Unrelated owners | Baseline cycle µs ±95% RME | Candidate cycle µs ±95% RME | Ratio | Intervals |
| --- | --- | --- | --- | --- |
| 0 | 187.429 ±3.7% | 186.336 ±4.1% | 0.99× | overlap |
| 100 | 165.669 ±8.0% | 178.756 ±2.2% | 1.08× | overlap |
| 1000 | 158.554 ±2.0% | 169.583 ±3.2% | 1.07× | higher, separate |

These controls reject extra late notifications and exercise partial/repeated disposal while a shared producer survives.

The current scoped engine has substantial measured overhead against the same raw Alien 3.2.0 comparator. At workload scale 10,000, its broad batch update scores are 2.294–3.996× raw, creation 7.786–16.693×, and disposal 4.801–6.753× across the five shapes. Raw continuous cycles at 0/100/1,000 unrelated owners cost 31.617/31.284/27.732 µs, versus the scoped 186.336/178.756/169.583 µs above: 5.89×/5.71×/6.12×. These use the same recorded late-window scores; the raw and scoped uncertainty margins remain in the [current result](consolidation-engine-current.json). They are workload ratios, not universal node counts or production bounds.

## Retained foreign success

The [normal diagnostic](consolidation-foreign-retention.json) keeps one producer alive while 1,000 consumers read its value, switch to a failing branch, retain their last success, and dispose. Retired owners/nodes remain at 0. A live failed consumer is a positive control. A [deliberate isolated fault](consolidation-foreign-retention-fault.json), which removes only the backlink deletion without changing repository source, retains 100/1,000 retired owners and derived nodes, then 1,001 after retiring the control; all are released when the producer retires.

| Checkpoint | Normal live scopes | Normal live nodes | Normal retired scopes | Fault retired scopes |
| --- | --- | --- | --- | --- |
| active-control, cycle 0 | 2 | 3 | 0 | 0 |
| active-control, cycle 100 | 2 | 3 | 0 | 100 |
| active-control, cycle 1000 | 2 | 3 | 0 | 1000 |
| control-retired, cycle 1000 | 1 | 1 | 0 | 1001 |
| all-retired, cycle 1000 | 0 | 0 | 0 | 0 |

Fault retainer paths run from the live producer through its WeakMap value Set, derived node, and owner. The scanner excludes weak edges and promotes WeakMap values only when both key and table are reachable; synthetic positive/negative controls cover that conditional reachability. The normal retention bundle hash equals the measured current graph bundle. Raw heaps stay local; only known labels, source/snapshot hashes, counts, and retainer paths are published. Heap-byte changes are diagnostic, not the leak criterion. This lane creates no async attempts, historical frames, renderer, browser, or DevTools state; earlier reports for those domains are not relabeled as current evidence.

## Secondary: ordinary return syntax inside `.tsrx`

The same authored fixture also contains ordinary `return <output…>` functions. They are a secondary compatibility path, not the primary `@{}` TSRX path. Native tracking currently uses descriptors there, with a material cost that remains disclosed:

| Case / operation | Baseline µs ±95% RME | Candidate µs ±95% RME | Ratio | Intervals |
| --- | --- | --- | --- | --- |
| Unread native return: mount | 5.097 ±12.9% | 7.935 ±14.4% | 1.56× | higher, separate |
| Unread native return: prop update | 1.571 ±8.4% | 4.090 ±13.5% | 2.60× | higher, separate |
| Unread native return: SSR | 0.591 ±26.0% | 2.387 ±21.2% | 4.04× | higher, separate |
| One-read native return: mount | 5.533 ±11.3% | 12.938 ±59.7% | 2.34× | overlap |
| One-read native return: prop update | 1.838 ±10.2% | 4.447 ±6.2% | 2.42× | higher, separate |
| One-read native return: signal update | 1.231 ±18.7% | 3.516 ±10.6% | 2.86× | higher, separate |
| One-read native return: SSR | 2.043 ±15.8% | 4.427 ±12.1% | 2.17× | higher, separate |

Native unread/single-read prop updates are 2.60×/2.42× their archived counterparts; the single-read signal update is 2.86×, and native SSR is 4.04× unread/2.17× with a read. Disabled ordinary-return controls overlap. This secondary path is not the basis for claims about compiled `@{}` TSRX performance.

## Reproduction and remaining limits

Use the runners and exact options in the result JSON and [README](../../README.md). The final native command is the same matched command as the preserved earlier run, with only the frozen source changed. The source archive hash is `df610b31e49a016a512f1ba926b1f07e6700659c6febe4900d99ac0a27e92147`. Final client/server source hashes are `c3d599109718adc8ccb1c70ababd34370ef72525fd541ac442f89cee638e23d7` and `2ae910fea1105e32198b44fc883965f5574f1e4436d9695a5cc728232f8fc4c4`. Every consumed source was rechecked after measurement.

Measurements used Node 26.4.0 on macOS arm64/Apple M5 Max, esbuild 0.28.1, Alien Signals 3.2.0, devalue 5.8.2, and happy-dom 20.11.0 for native rendering. The compiler is verified public TSRX tag source with the repository patch, not the denied npm compiler payload. [Performance input metadata](consolidation-performance-inputs.json) records final source verification, deterministic guard results, the preload hash, actual dependency load evidence, and hashes of local raw logs. Local `.log` files are ignored and are not links promised by this report.

All 15 consolidation JSON files were formatted with the repository configuration after retaining their exact original bytes locally. Parsed values were verified unchanged. Source/bundle hashes and explicitly labeled raw log hashes retain their original meaning. The local normalization manifest has SHA256 `7e531f6dd59f165de4755336598a4accc27d8f83c2885ccab45601e368509d10` and records both original and published report hashes; it is not a published artifact.

The 30 pure routing, workload, bundle boundary, and heap scanner checks pass. Final native/browser semantic validation and typechecking have their own provenance and limitations. The configured registry 403 still prevents claiming a locked workspace install, canonical full-workspace gates, or green CI from these local experiments.
