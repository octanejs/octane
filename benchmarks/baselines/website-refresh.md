# Website benchmark refresh — Octane main, 9 October 2026

The website imports 29 records from `local/`. This snapshot measures every
published suite with its normal sample count and complete framework matrix.
The homepage's 20 summary rows and bundle-size ranges are recomputed with
`createHomeSummary(FRAMEWORK_CARDS)`.

## Source and environment

- Octane main source:
  [`89f90427e19f6cff611a22f765e01e3422549aaf`](https://github.com/octanejs/octane/commit/89f90427e19f6cff611a22f765e01e3422549aaf).
  This snapshot includes the performance improvements merged after 0.12.0;
  it does not measure the published 0.12.0 release.
- [Measurement run](https://github.com/octanejs/octane/actions/runs/37972738863),
  9 October 2026, 18:23–19:25 UTC, at the source revision above.
- Blacksmith `blacksmith-4vcpu-ubuntu-2404` runner: AMD EPYC, four vCPUs,
  Linux 6.6.141, x64.
- Node 24.19.0, pnpm 12.9.1, Playwright 1.61.1, Chromium 149.0.7827.55,
  Vite 8.1.5.
- Frozen repository lockfile: React 19.2.7 with React Compiler 1.0.0,
  Preact 10.29.8, Solid 2.0.0-beta.20, Svelte 5.56.7, Ripple 0.4.0,
  Vue 3.6.0-rc.1, and Inferno 9.1.0.

Suites ran sequentially in one CI job. Framework comparisons use targets from
the same suite invocation. The previous snapshot also used the Linux CI runner,
but these are separate runs with potentially different runner state. Absolute
timing differences between snapshots do not establish a main-versus-release
speedup. The source, toolchain, and normal sampling configuration are recorded
here so the results can be reproduced.

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
operations, with finite scores and no failed harnesses. The target and operation
inventory and normal sample counts are unchanged from the previous snapshot.

Of 169 applicable ratio guards, 163 are within their limits. All bundle-size
guards pass, including the seven that breached in the 0.12.0 snapshot. Four
timing guards breach, and two further timing breaches have existing waivers:

| Suite / operation | Target / reference | Observed ratio | Maximum | Status |
| --- | --- | ---: | ---: | --- |
| js-framework / clear | Octane JSX / Octane TSRX | 1.34101 | 1.30 | Breach |
| js-framework-reorder / rotateb | Octane TSRX / React | 0.61475 | 0.60 | Existing waiver through 24 October |
| memo-wall / parent_rerender_equal_A | Octane TSRX / React | 0.68578 | 0.60 | Breach |
| memo-wall / ctx_through_wall_B | Octane TSRX / React | 1.60000 | 0.85 | Existing waiver through 24 October |
| memo-wall / ctx_through_wall_A | Octane JSX / Octane TSRX | 2.26263 | 2.25 | Breach |
| uibench / tree/[2,2,2,2,2,2,2,2,2,2]/render | Octane TSRX / React | 2.37065 | 1.90 | Breach |

The measurement workflow finishes with a failed ratio verdict because of the
four unwaived timing breaches. This snapshot must not be described as passing
`--ratios`. These observations are retained with the full-run records and need
reproduction and attribution before any runtime fix or guard change; this data
refresh changes neither the measured source nor the guards. Correctness checks
passed for every suite.
