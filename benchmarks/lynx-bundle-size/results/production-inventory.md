# Production Lynx bundle inventory

## Re-baseline on main `c60eef1342` (2026-10-04)

The budgets frozen by #765 for the issue #57 candidate are enforced only by the
weekly bench, so the growth merged after it reached no pull request gate.
`inventory-budgets.json` now records every artifact, thread-section, and owner
budget at the bytes measured here plus 32.

- source: main `c60eef13428f9ba7a10bf8c189c308e1965e996d`
- fixture: `benchmarks/lynx-table/app`, `BENCH_AUTOROWS=0`, production Rspeedy, split chunks off, source maps off
- tool host: Node `v24.18.0`, Darwin `27.0.0`
- command: `OCTANE_INVENTORY_CALIBRATE=1 OCTANE_INVENTORY_OUTPUT=<file> node benchmarks/lynx-bundle-size/inventory.mjs`

| artifact | raw | gzip | Brotli | SHA-256 |
|---|---:|---:|---:|---|
| Octane Web | 519,371 B | 144,186 B | 108,027 B | `b31070e73e600f10b387852f68f05dcb94c642774f142d52b2388cb458d925c1` |
| Octane Lynx | 506,699 B | 173,112 B | 145,081 B | `00062e4c9a8b14edfe628de686de10cb06a7b58d548c16277e94c92a118b5ffc` |
| Lynx main program | 220,586 B | 62,766 B | 53,366 B | `c4b8fabe224570c740dec95847000ef3fb076224e8b2895be0d81c3ec1002498` |
| Lynx background program | 294,633 B | 81,154 B | 69,005 B | `1d62fca12862045675d8f8c676973345351ab05b9ddd359527752709ee59a630` |

### Where the bytes went

Rebuilding #765 (`21f4dfb244`) reproduces its frozen raw budgets exactly. The
595 candidates are the 594 first-parent main commits after #765 that touch
`packages/lynx/src`, `packages/octane/src`, `packages/rspeedy-plugin-octane`,
the fixture, or the lockfile, plus main's head at the time, `f8c211f5ba`; #1710
then changes only `run.mjs`. Every interval whose Web, Lynx,
main, or background raw total moved by more than 200 B was bisected to a single
commit, in 68 builds. Each named row is that commit's exact production delta
against its first parent, and the rows sum to the totals.

| pull request | Web raw | Lynx raw | main raw | background raw | Web gzip | Lynx gzip | main gzip | background gzip |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| #816 improve Activity parity and batch hidden updates | +815 | +815 | 0 | +815 | +216 | +224 | 0 | +199 |
| #885 serialize cross-thread transport payloads | +6,113 | +6,160 | +2,819 | +3,294 | +2,226 | +2,622 | +1,060 | +1,211 |
| #886 make Lynx startup measurable on Native (fixture) | +2,826 | +2,871 | +1,404 | +1,400 | +1,069 | +1,264 | +570 | +466 |
| #1011 index cross-owner universal draft lookups | +230 | +230 | 0 | +230 | +76 | +72 | 0 | +64 |
| #1044 bring native hover allocations close to Solid | +9,013 | +9,003 | 0 | +9,003 | +2,218 | +2,241 | 0 | +2,180 |
| #1076 reduce repeated hook bookkeeping | +1,550 | +1,572 | 0 | +1,572 | +543 | +615 | 0 | +616 |
| #1086 reduce universal renderer materialization and preparation work | +778 | +819 | 0 | +819 | +528 | +471 | 0 | +487 |
| #1138 remove legacy Context.Provider support | +935 | +862 | +451 | +463 | +352 | +325 | +175 | +127 |
| #1299 keep live suspense replays across unrelated scheduled renders | +326 | +326 | 0 | +326 | +90 | +77 | 0 | +86 |
| #1652 ship universal host bindings and template programs only to renderers that use them | −6,689 | −6,673 | 0 | −6,673 | −1,029 | −965 | 0 | −1,002 |
| #1665 update retained meshes faster than React Three Fiber again | +446 | +448 | 0 | +448 | +105 | +97 | 0 | +98 |
| 584 other commits, net within 200 B raw per interval | +1,454 | +1,349 | +217 | +1,183 | +423 | +676 | −17 | +581 |
| **total, #765 to main** | **+17,797** | **+17,782** | **+4,891** | **+12,880** | **+6,817** | **+7,719** | **+1,788** | **+5,113** |

The same commit built from two checkout paths gave identical raw bytes and
gzip 1 to 3 B apart, so the gzip column comes from one checkout and the gzip
budgets from another. The 32-byte margin covers that.

### Owner slices

An owner slice is the artifact's raw bytes times the owner's share of
reachable transformed module bytes. Those module bytes still include comments
and code that minification and tree shaking later remove, and a slice moves
whenever another owner's share moves.

| owner | Web budget: old → new | Lynx budget: old → new | Lynx reachable Δ | source |
|---|---:|---:|---:|---|
| compiler-output-app | 142,009 → 150,952 | 138,426 → 147,269 | +95,645 | Rspack's concatenated background root, which carries the runtime modules concatenated into it: #1044 +24,452, #885 +18,342, #1076 +5,138, #1086 +4,062, #886 +3,897, #816 +2,505, #1665 +2,169 |
| universal-runtime | 78,640 → 84,862 | 76,655 → 82,792 | +60,907 | `universal-core.ts` +58,111: #1044 +24,452, #1086 +4,062, #816 +2,505, #1665 +2,169, #1299 +1,216, #1138 +809, #1011 +589, and about 26 KB from commits whose final delta stayed under 200 B; `owner-kernel/hooks.ts` (#1714) moved out of the core |
| protocol-transport | 35,153 → 39,059 | 34,265 → 38,107 | +34,228 | #885 adds `transport-codec.ts` (32,216) and grows `transport.ts`; #909 +616 |
| octane-runtime-other | 978 → 4,296 | 954 → 4,192 | +21,049 | helpers the universal core now imports: `hook-slot-cache.ts` 5,641 (#1076), `context-identity.ts` 4,748 (#1138, dev-only error in #1266), `method-dep.ts` 3,304 (#1339), `sub-slot.ts` 2,493 (#818), `runtime-tags.ts` 1,915 (#1169), `context-epoch.ts` 1,419 (#1091), `shared-value-helpers.ts` +1,330 (#1435); most moved out of `universal-core.ts` |
| fixture-app | 11,188 → 12,579 | 10,905 → 12,273 | +11,691 | #886 rewrote the fixture |
| build-wrapper-main | 95,043 → 93,876 | 92,644 → 91,586 | +18,722 | #885 +17,408; slice shrank as other shares grew |
| first-screen-adoption | 34,513 → 34,257 | 33,642 → 33,422 | +7,733 | slice shrank as other shares grew |
| host-driver-papi | 41,301 → 39,525 | 40,259 → 38,562 | 0 | slice shrank as other shares grew |
| lynx-runtime-other | 33,032 → 31,751 | 32,199 → 30,977 | +839 | slice shrank as other shares grew |
| public-state-worklets | 29,271 → 28,106 | 28,532 → 27,421 | +534 | slice shrank as other shares grew |
| generated-wrapper | 255 → 276 | 249 → 270 | 0 | measured + 32 |
| third-party-runtime | 191 → 216 | 187 → 212 | 0 | measured + 32 |

The sections below are the issue #57 record that these budgets replace.

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
