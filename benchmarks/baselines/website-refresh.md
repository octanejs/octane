# Website benchmark refresh — main, 11 October 2026

The website imports 29 records from `local/`. This snapshot measures every
published suite with its normal sample count and complete framework matrix.
The homepage's 20 summary rows and bundle-size ranges are recomputed with
`createHomeSummary(FRAMEWORK_CARDS)`.

## Source and environment

- Measured Octane main revision:
  [`6892fd6682af9f02f8be477da23b81e349c111ec`](https://github.com/octanejs/octane/commit/6892fd6682af9f02f8be477da23b81e349c111ec)
  (package version 0.13.1). This is a source snapshot, not a measurement of
  the published Octane release or subsequent main changes.
- [Measurement run](https://github.com/octanejs/octane/actions/runs/38164749859):
  all 29 suites ran sequentially in one CI job with `full: true`.
  Measurements ran on 11 October 2026, 18:40:59–19:20:33 UTC
  (19:40:59–20:20:33 Europe/London).
- Blacksmith `blacksmith-4vcpu-ubuntu-2404` runner: Intel Xeon, four vCPUs,
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

The `js-framework` harness measures `select`,
`swap`, and `select_lots` in bounded, calibrated batches targeting about 20 ms,
followed by untimed warmup of the exact batch. Each score is normalized per
committed click;
`repeat` and `sampleMs` retain the batch size and median batch duration. Selection
alternates rows and swaps use odd counts, with the usual correctness gates.
These warm batch averages differ from the isolated-click timings published
before 10 October 2026 and must not be presented as direct speedups over them.
The other operations, including `update` and `remove`, retain single-click
samples because repetition changes their workload.

This run used an Intel Xeon runner; the previous snapshot used AMD EPYC.
Runner state can also differ between snapshots. Absolute timing differences alone
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

## Import validation and ratio guards

All 29 harnesses exited successfully. The imported records contain 232 targets
and 3,092 target/operation measurements, with no missing targets, operations, or
non-finite scores. Iteration counts, repetition counts, and fixed sample counts
match the previous snapshot; duration-based SSR throughput counts vary with the
number of renders completed. The calibrated JS Framework batching metadata is
present and valid.

The run checked 169 applicable paired ratio guards: 167 passed and two timing
guards breached their bounds. Neither breach has a waiver, so the measurement
workflow failed its ratio gate even though every harness completed successfully.
All applicable bundle-size guards passed.

| Suite / operation | Target / reference | Observed ratio | Maximum |
| --- | --- | ---: | ---: |
| `svg-dashboard` / `select_toggle` | Octane TSRX / Solid | 1.0916× | 0.9× |
| `uibench` / `tree/[2,2,2,2,2,2,2,2,2,2]/render` | Octane TSRX / React | 2.0722× | 1.9× |

These are the unmodified measurements from the complete run. The SVG guard also
breached in the previous snapshot; the UIbench guard breached in this run.
This refresh records those outcomes without changing guard bounds or adding
waivers. The prior snapshot's memo-wall JSX/TSRX guard passed in this run.
The timings alone do not determine whether a change is a regression or runner
variation; that needs a controlled investigation.
