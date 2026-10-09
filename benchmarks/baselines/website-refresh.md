# Website benchmark refresh — Octane 0.12.0, 9 October 2026

The website imports 29 records from `local/`. This snapshot measures every
published suite with its normal sample count and complete framework matrix.
The homepage's 20 summary rows and bundle-size ranges are recomputed with
`createHomeSummary(FRAMEWORK_CARDS)`.

## Source and environment

- Octane 0.12.0 release source:
  [`961638e3c41dce5020560b56fa5e084b4257e33e`](https://github.com/octanejs/octane/commit/961638e3c41dce5020560b56fa5e084b4257e33e).
  npm's `latest` tag was verified as 0.12.0 before recording.
- [Measurement run](https://github.com/octanejs/octane/actions/runs/37902746685),
  9 October 2026, 08:05–08:49 UTC, at
  [`f7de4535041c607c0766756e3dafd2a472c52323`](https://github.com/octanejs/octane/commit/f7de4535041c607c0766756e3dafd2a472c52323).
  This revision differs from the release only in the benchmark workflow and its
  documentation; packages, fixtures, harnesses, lockfile, and guards are identical.
- Blacksmith `blacksmith-4vcpu-ubuntu-2404` runner: AMD EPYC, four vCPUs,
  Linux 6.6.141, x64.
- Node 24.19.0, pnpm 12.9.1, Playwright 1.61.1, Chromium 149.0.7827.55,
  Vite 8.1.5.
- Frozen repository lockfile: React 19.2.7 with React Compiler 1.0.0,
  Preact 10.29.8, Solid 2.0.0-beta.20, Svelte 5.56.7, Ripple 0.4.0,
  Vue 3.6.0-rc.1, and Inferno 9.1.0.

Suites ran sequentially in one CI job. Framework comparisons use targets from
the same suite invocation. The previous snapshot used an Apple M5 Max on macOS;
these absolute timings must not be compared with it as evidence of a release
speedup. Hardware, operating system, and some harness methodology have changed
since that snapshot. The current source and normal sampling configuration are
recorded here so those changes stay visible.

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
operations, with finite scores and no failed harnesses. No operation from the
previous checked-in records is removed. The current harness adds two memo-wall
work counters and 20 SVG-dashboard work counters.

Of 169 applicable ratio guards, 162 pass and seven bundle-size guards breach:

| Gzip metric | Octane TSRX / reference | Observed ratio | Maximum |
| --- | --- | ---: | ---: |
| Rows total | Ripple | 2.53113 | 2.51 |
| Rows total | Solid | 2.52752 | 2.50 |
| Rows total | Svelte | 2.44207 | 2.42 |
| TodoMVC total | Svelte | 2.63061 | 2.58 |
| Chat total | Svelte | 2.51165 | 2.46 |
| Weather total | React | 0.76917 | 0.76 |
| Weather framework | React | 0.73489 | 0.72 |

These breaches measure the unchanged published release and frozen lockfile;
refreshing website data does not change the measured bundles. They need a
separate bundle-size investigation or an explicitly justified guard update.
The measurement workflow therefore finishes with a failed ratio verdict, and
this snapshot must not be described as passing `--ratios`. Its correctness
checks and every other applicable ratio guard pass.
