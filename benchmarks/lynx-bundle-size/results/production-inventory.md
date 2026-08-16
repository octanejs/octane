# Production Lynx bundle inventory for the issue #57 candidate

## Reproducible baseline

- formal source: the issue #57 first-screen template-range candidate over exact upstream `dcf94cfc83c8e9e8484d01446c3ff680134dd1d1`
- fixture: `benchmarks/lynx-table/app`, `BENCH_AUTOROWS=0`, production Rspeedy, split chunks off, source maps off
- tool host: Node `v24.18.0`, Darwin `25.5.0`
- checked command: `node benchmarks/bench.mjs --ratios lynx-bundle-size`, calibrated at `2026-08-16T19:09:31.715Z` from one lockfile and isolated dependency trees for the base and candidate

| artifact | raw | gzip | Brotli | SHA-256 |
|---|---:|---:|---:|---|
| Octane Web | 501,574 B | 137,369 B | 103,608 B | `7d3ba3972209483704f08e077c2068dcea4fb56909a6b7a3b85c5f78f6d3eb64` |
| Octane Lynx | 488,917 B | 165,395 B | 139,006 B | `187f4b6d4dff59e9e13e87fe081d281046728c13090b6da602058bb00a009bf2` |
| Lynx main program | 215,695 B | 60,980 B | 51,837 B | `ec9cacb8879a69ff8b6466b8f6b408241c6483def46aa246a126d2ce611fc7ea` |
| Lynx background program | 281,753 B | 76,045 B | 64,843 B | `e2027a9fbfbd62303c0d2ba777ee5e498d1de84dd8b63306391821db57e952df` |

The exact `dcf94cfc8` control built in the same measurement window was 497,310 / 136,123 B
for Web and 485,163 / 163,571 B for Lynx. The candidate therefore adds 1,246 B
(0.92%) Web gzip and 1,824 B (1.12%) Lynx gzip. Those controlled deltas, rather
than the cumulative movement from older frozen caps, are the issue #57 size tax.

## Reachable-owner inventory

The production compilation exposes 3,032,772 reachable transformed module
bytes. The inventory distributes each final artifact's raw total according to
those owner weights, accounting for 100%. This is a prioritization ledger, not
an additive compressed-size claim.

| owner | Web attributed raw | Lynx attributed raw | complete-artifact share |
|---|---:|---:|---:|
| compiler-emitted app/background program | 142,009 B | 138,426 B | 28.3% |
| main-thread build/runtime wrapper | 95,043 B | 92,644 B | 18.9% |
| universal runtime | 78,640 B | 76,655 B | 15.7% |
| host driver / PAPI | 41,301 B | 40,259 B | 8.2% |
| protocol / transport / profiling | 35,153 B | 34,265 B | 7.0% |
| first screen / adoption | 34,513 B | 33,642 B | 6.9% |
| other Lynx runtime | 33,032 B | 32,199 B | 6.6% |
| public state / worklets | 29,271 B | 28,532 B | 5.8% |
| authored fixture app | 11,188 B | 10,905 B | 2.2% |
| remaining wrappers, Octane helpers, third party | 1,424 B | 1,390 B | 0.3% |

Every owner above 2% remains on the feature-equivalence ledger. A child may
claim gzip ownership only after a controlled production ablation or isolated
product patch; these raw weights must not be converted into predicted gzip.

## Controlled gzip ledger

- #706: Web/Lynx gzip `+1.38%/+1.45%`, accepted as a measured clear-performance size tax.
- #707: preview main `76,915 -> 75,024 B` and IFR main `81,995 -> 79,980 B`, both `-2.46%`; complete preview `150,079 -> 148,183 B`, complete IFR `155,075 -> 152,968 B`; background raw unchanged. This is an accepted optional-worklet child, still pending upstream.
- merged mainline through `dcf94cfc8`: rows-0 Web/Lynx gzip moved from the old caps to `136,123 / 163,571 B`, and preview/IFR main gzip to `80,507 / 85,724 B`. This includes the merged dense-clear teardown and is pre-existing drift, not issue #57 ownership.
- issue #57: rows-0 Web/Lynx gzip `136,123 -> 137,369 B` (+0.92%) and `163,571 -> 165,395 B` (+1.12%); preview/IFR main gzip `80,507 -> 82,070 B` (+1.94%) and `85,724 -> 87,566 B` (+2.15%). The size tax is accepted against same-window public/all-row 10k FCP improvements of 13.2%/11.8% and a 30k all-row improvement of 9.3%.

## Decision

The deterministic artifact, inventory, and ratio gates pass with the candidate.
This report accepts its measured size tax for the independently measured FCP
gain; it does not convert the reachable-owner weights into compressed ownership
or claim that remaining startup, heap, teardown, adoption, and mixed-version
work is complete.
