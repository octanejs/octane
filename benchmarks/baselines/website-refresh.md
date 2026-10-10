# Website benchmark refresh — main, 10 October 2026

The website imports 29 records from `local/`. This snapshot measures every
published suite with its normal sample count and complete framework matrix.
The homepage's 20 summary rows and bundle-size ranges are recomputed with
`createHomeSummary(FRAMEWORK_CARDS)`.

## Source and environment

- Measured Octane main revision:
  [`8c09d81526a48abf87d9c54d9aea0a690fa86eb1`](https://github.com/octanejs/octane/commit/8c09d81526a48abf87d9c54d9aea0a690fa86eb1)
  (package version 0.12.1). This is a source snapshot, not a measurement of
  the published Octane release or subsequent main changes.
- [Measurement run](https://github.com/octanejs/octane/actions/runs/38081103617):
  all 29 suites ran sequentially in one CI job with `full: true`.
  Measurements ran on 10 October 2026, 19:47–20:28 UTC.
- Blacksmith `blacksmith-4vcpu-ubuntu-2404` runner: AMD EPYC, four vCPUs,
  Linux 6.6.141, x64.
- Node 24.19.0, pnpm 12.9.1, Playwright 1.61.1, Chromium 149.0.7827.55,
  Vite 8.1.5.
- Frozen repository lockfile: React 19.2.7 with React Compiler 1.0.0,
  Preact 10.29.8, Solid 2.0.0-rc.14, Svelte 5.57.2, Ripple 0.4.0,
  Vue 3.6.0-rc.10, and Inferno 9.1.0. Solid uses
  `@solidjs/vite-plugin` 3.0.0-next.49 and the matching compiler/Babel
  plugin at 2.0.0-rc.14. Vue Vapor uses the matching runtime and compiler
  packages at 3.6.0-rc.10.

## Measurement protocol

Suites ran sequentially. Every framework comparison uses targets from the same
complete suite invocation. The normal sample counts and default single harness
invocation per suite are retained; this is not a quick run or a five-run
`bench:stable` aggregate.

The `js-framework` harness on this revision changes `select`, `swap`, and
`select_lots` to bounded, calibrated batches targeting about 20 ms, followed by
untimed warmup of the exact batch. Each score is normalized per committed click;
`repeat` and `sampleMs` retain the batch size and median batch duration. Selection
alternates rows and swaps use odd counts, with the usual correctness gates.
These warm batch averages are a different measurement from the previous
snapshot's isolated-click timings and must not be presented as direct speedups.
The other operations, including `update` and `remove`, retain single-click
samples because repetition changes their workload.

Runner state can differ between snapshots. Absolute timing differences alone
do not establish a framework speedup. The source, toolchain, and sampling
configuration are recorded here for reproduction.

## Reproduction

Check out the measurement revision above, install the frozen lockfile and
Playwright Chromium, then run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter octane-js-framework-benchmarks exec playwright install --with-deps chromium
node benchmarks/bench.mjs --record \
  js-framework js-framework-reorder js-framework-deopt todomvc \
  weather-app weather-app-lighthouse chat-stream svg-dashboard uibench \
  dbmon dbmon-deopt effectful-list memo-wall recursive-context spa-navigation \
  signal-favoring portal-swarm async-waterfall async-composition news \
  streaming-ssr ssr-throughput ssr-http tanstack-start bundle-size \
  three-renderer three-bundle-size lynx-table lynx-table-web
```

CI used the same suite list with `--ratios` instead of `--record`, selected by
the Bench workflow's `full: true` input. The 29 suite JSON files were imported
from its `bench-results` artifact and formatted without changing their values.
The artifact's `environment.json` supplies the environment above. No quick-run
results are substituted, and no guard thresholds are changed.

## Validation and guard observations

All 29 harnesses exited successfully. The records contain 232 targets and 3,092
operations, with finite scores and no failed harnesses. Target and operation
coverage, iteration counts, and fixed sample counts are unchanged from the
previous snapshot. Duration-based SSR throughput render counts vary with the
work completed during each timed interval.

Of 169 applicable ratio guards, 167 are within their limits. All bundle-size
guards pass. Two timing guards breach:

| Suite / operation | Target / reference | Observed ratio | Maximum |
| --- | --- | ---: | ---: |
| svg-dashboard / select_toggle | Octane TSRX / Solid | 1.03023 | 0.90 |
| uibench / tree/[2,2,2,2,2,2,2,2,2,2]/render | Octane TSRX / React | 2.02572 | 1.90 |

The workflow finishes with a failed ratio verdict because of these two
unwaived breaches; this snapshot must not be described as passing `--ratios`.
Both also breached in the previous snapshot. These observations are retained
with the normal-sample records and need reproduction and attribution before
any runtime fix or guard change. This data refresh changes neither the measured
source nor the guards. Correctness checks passed for every suite.
