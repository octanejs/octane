# Website benchmark refresh — peer updates, 9 October 2026

The website imports 29 records from `local/`. This snapshot measures every
published suite with its normal sample count and complete framework matrix.
The homepage's 20 summary rows and bundle-size ranges are recomputed with
`createHomeSummary(FRAMEWORK_CARDS)`.

## Source and environment

- Measured revision:
  [`969428fcce3a7b33294cfc03a34a94c204805e76`](https://github.com/octanejs/octane/commit/969428fcce3a7b33294cfc03a34a94c204805e76).
  This uses Octane main at `7bb02657b4918469a959a451016454291d5db4af`
  (package version 0.12.1), plus the Svelte, Solid and Vue dependency updates
  in [PR #1954](https://github.com/octanejs/octane/pull/1954). It does not
  measure subsequent changes to main or the published Octane release.
- [First measurement run](https://github.com/octanejs/octane/actions/runs/37995046442):
  the first 21 suites in the reproduction list, through `streaming-ssr`.
  These records completed on 9 October 2026, 21:43–22:18 UTC.
- [Remaining measurement run](https://github.com/octanejs/octane/actions/runs/37999134761):
  the final eight suites, from `ssr-throughput` through `lynx-table-web`,
  on 9 October 2026, 22:27–22:38 UTC, at the identical source revision and
  normal sample counts.
- Both Blacksmith `blacksmith-4vcpu-ubuntu-2404` runners report AMD EPYC,
  four vCPUs, Linux 6.6.141, x64.
- Node 24.19.0, pnpm 12.9.1, Playwright 1.61.1, Chromium 149.0.7827.55,
  Vite 8.1.5.
- Frozen repository lockfile: React 19.2.7 with React Compiler 1.0.0,
  Preact 10.29.8, Solid 2.0.0-rc.14, Svelte 5.57.2, Ripple 0.4.0,
  Vue 3.6.0-rc.10, and Inferno 9.1.0. Solid uses
  `@solidjs/vite-plugin` 3.0.0-next.49 and the matching compiler/Babel
  plugin at 2.0.0-rc.14. Vue Vapor uses the matching runtime and compiler
  packages at 3.6.0-rc.10.

Suites ran sequentially within each CI job. The first job was interrupted
during SSR throughput after a stale live-log display was mistaken for a stall;
the downloaded log confirmed that it was progressing. Its 21 completed records
are retained, and the remaining eight suites ran in the second job. No partial
SSR throughput measurements or diagnostic repeat timings are used.

Every framework comparison uses targets from the same complete suite
invocation. These are separate runs with potentially different runner state,
including from the previous snapshot. Absolute timing differences between
snapshots do not establish a framework or dependency speedup. The source,
toolchain, and normal sampling configuration are recorded here so the results
can be reproduced.

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

CI used the same suite list, split as described above, with `--ratios` instead
of `--record`, selected by the Bench workflow's `full: true` input. The 29 suite
JSON files were imported from the two `bench-results` artifacts and formatted
without changing their values. The artifacts' `environment.json` files supply
the environment above. No quick-run results are substituted, and no guard
thresholds are changed.

## Validation and guard observations

All 29 harnesses exited successfully. The records contain 232 targets and 3,092
operations, with finite scores and no failed harnesses. The target and operation
inventory and normal sample counts are unchanged from the previous snapshot.

Of 169 applicable ratio guards, 164 are within their limits. All bundle-size
guards pass. Four timing guards breach, and one further timing breach has an
existing waiver:

| Suite / operation | Target / reference | Observed ratio | Maximum | Status |
| --- | --- | ---: | ---: | --- |
| js-framework-reorder / rotateb | Octane TSRX / React | 0.60286 | 0.60 | Existing waiver through 24 October |
| tanstack-start / warm_seq_request_home | Octane minimal / React | 3.89025 | 3.50 | Breach |
| svg-dashboard / select_toggle | Octane TSRX / Solid | 1.03210 | 0.90 | Breach |
| uibench / tree/[2,2,2,2,2,2,2,2,2,2]/render | Octane TSRX / React | 2.08455 | 1.90 | Breach |
| uibench / tree/[2,2,2,2,2,2,2,2,2,2]/render | Octane TSRX / Preact | 1.90704 | 1.90 | Breach |

The first workflow was cancelled after its 21 complete records; auditing those
records gives three unwaived breaches and the existing waiver. The remaining
workflow finishes with a failed ratio verdict because of the TanStack Start
breach. The combined snapshot must not be described as passing `--ratios`.
These observations are retained with the normal-sample records and need
reproduction and attribution before any runtime fix or guard change. The deep
UIbench tree also breached against React in the preceding snapshot. This data
refresh changes neither the measured source nor the guards. Correctness checks
passed for every suite.
