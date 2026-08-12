# Production Lynx bundle inventory on post-#706/#707 main

## Reproducible baseline

- formal source: upstream `ffadd397f4466d4e4a32b4527143270442c9c41e`, which contains merged #706 (`47ff0a33`) and #707 (`4a792e39`)
- fixture: `benchmarks/lynx-table/app`, `BENCH_AUTOROWS=0`, production Rspeedy, split chunks off, source maps off
- tool host: Node `v22.22.2`, Linux `5.15.120.bsk.3-amd64`
- cross-framework run: `2026-08-11T21-14-12-65160668d8d9-integration-706-707-featured.json`; calibration `2367.5`; all six entries rebuilt from one lockfile; zero DNF/null cells

| artifact | raw | gzip | Brotli | SHA-256 |
|---|---:|---:|---:|---|
| Octane Web | 485,345 B | 132,334 B | 100,114 B | `b4b2d5ad69f02c4f862915f39d3b2d7da59f452ef4237d45b832edbb40c7e3a6` |
| Octane Lynx | 474,618 B | 159,077 B | 134,144 B | `44c4493e4c03f02ebda6271cd4f013befdca5047e6b520f62436ca4952a16e46` |
| Lynx main program | 203,712 B | 57,563 B | 48,950 B | `d4c9f60c051b31bb4065b15a42be1d06656fa8356df2c0b6356b73e05bad813c` |
| Lynx background program | 277,505 B | 74,381 B | 63,571 B | `4d64e4db3d97f62a8fb374b6c534555a33204d540f8338eaffc63846ead67eca` |

The post-integration all-framework run at local integration `5a373524` reported
`484,572 / 132,135 B` Web and `473,905 / 158,897 B` Lynx. The later upstream
parity commits move only the Octane source; the formal budgets above are bound
to the checked in-process fixture builder. The five ReactLynx/Vue comparison
median remains 44,489 B Web gzip and 51,228 B Lynx gzip, leaving formal main at
2.97× and 3.11× respectively.

## Reachable-owner inventory

The production compilation exposes 2,923,829 reachable transformed module
bytes. The inventory distributes each final artifact's raw total according to
those owner weights, accounting for 100%. This is a prioritization ledger, not
an additive compressed-size claim.

| owner | Web attributed raw | Lynx attributed raw | complete-artifact share |
|---|---:|---:|---:|
| compiler-emitted app/background program | 140,155 B | 137,057 B | 28.9% |
| main-thread build/runtime wrapper | 90,775 B | 88,768 B | 18.7% |
| universal runtime | 78,258 B | 76,528 B | 16.1% |
| host driver / PAPI | 37,599 B | 36,768 B | 7.7% |
| protocol / transport / profiling | 34,427 B | 33,666 B | 7.1% |
| other Lynx runtime | 32,786 B | 32,061 B | 6.8% |
| first screen / adoption | 30,773 B | 30,093 B | 6.3% |
| public state / worklets | 28,191 B | 27,568 B | 5.8% |
| authored fixture app | 11,420 B | 11,167 B | 2.4% |
| remaining wrappers, Octane helpers, third party | 961 B | 942 B | 0.2% |

Every owner above 2% remains on the feature-equivalence ledger. A child may
claim gzip ownership only after a controlled production ablation or isolated
product patch; these raw weights must not be converted into predicted gzip.

## Controlled gzip ledger

- #706: Web/Lynx gzip `+1.38%/+1.45%`, accepted as a measured clear-performance size tax.
- #707: preview main `76,915 -> 75,024 B` and IFR main `81,995 -> 79,980 B`, both `-2.46%`; complete preview `150,079 -> 148,183 B`, complete IFR `155,075 -> 152,968 B`; background raw unchanged. This is an accepted optional-worklet child, still pending upstream.
- formal-main preview/IFR recalibration: main gzip `77,286 / 82,274 B`, background raw `272,504 B`. These exact post-merge values replace the stale pre-#706 gate without adding controlled gzip deltas arithmetically.

## Decision

This is the required inventory-only and budget patch before another product
size change. It does not claim the umbrella's 20% target: #707 is one controlled
child, #706 is an accepted tax, and all other >2% owners remain explicitly
accounted. Runtime acceptance continues to require AB/BA latency, startup,
heap, teardown, worklet/thread-call, adoption, mixed-version, and diagnostic
gates for each future child.
