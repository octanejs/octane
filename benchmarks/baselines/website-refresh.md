# Website benchmark refresh — Octane 0.8.0, 3 October 2026

The website imports 29 records from `local/`. This refresh measures the complete
framework matrix for every published suite with its normal sample count. The
home-page summary is recomputed with `createHomeSummary(FRAMEWORK_CARDS)`.

## Environment

- Octane 0.8.0 release source:
  [`7442a19ed355e5d3d5c6a925ddd8e2f704b176dd`](https://github.com/octanejs/octane/commit/7442a19ed355e5d3d5c6a925ddd8e2f704b176dd).
  npm's `latest` tag was verified as 0.8.0 during the run.
- Apple M5 Max, 18 CPU cores, arm64, macOS 27.0 (26A428).
- Node 24.18.0, pnpm 11.15.1, Playwright 1.61.1, Chromium 149.0.7827.55.
- Frozen repository lockfile: React 19.2.7 with React Compiler 1.0.0,
  Preact 10.29.8, Solid 2.0.0-beta.20, Svelte 5.56.7, Ripple 0.4.0,
  Vue 3.6.0-rc.1, and Inferno 9.1.0. The website's Ripple label now matches
  the measured version.

Suites ran sequentially, with no concurrent tests or builds from this task.
Two pre-existing Node test workers from another checkout remained CPU-active;
this was a shared development machine, not an isolated performance host.
Framework comparisons use measurements from the same suite invocation.
Absolute timings are specific to this environment, including its OS and load;
this refresh does not compare them with the previous snapshot as evidence of
an Octane release speedup.

## Reproduction

Check out the source revision above, install the frozen lockfile and Playwright
Chromium, then run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter octane-js-framework-benchmarks exec playwright install chromium
node benchmarks/bench.mjs --record \
  js-framework js-framework-reorder js-framework-deopt todomvc \
  weather-app weather-app-lighthouse chat-stream svg-dashboard uibench \
  dbmon dbmon-deopt effectful-list memo-wall recursive-context spa-navigation \
  signal-favoring portal-swarm async-waterfall async-composition news \
  streaming-ssr ssr-throughput ssr-http tanstack-start bundle-size \
  three-renderer three-bundle-size lynx-table lynx-table-web
```

The normal runner performs each harness's warmups, repeated measurements, and
semantic/identity/lifecycle checks. No quick-run results are substituted.
All framework targets from the previous snapshot remain present. The current
memo-wall harness additionally records `bail-compare` and its work-budget
control. Framework, fixture, harness, lockfile, and ratio-guard sources are
unchanged by this refresh.

## Validation and performance guards

All 29 suite invocations exited successfully. The records contain 233 targets
(including diagnostics and budget controls) and 3,077 operations, with finite
scores and no failed harnesses. The homepage's 20 summary rows are derived from
these records rather than copied by hand.

Auditing the records against the applicable committed ratio guards checks 215
guards and finds 19 breaches:

| Suite | Breaches | Observation |
| --- | ---: | --- |
| Bundle size | 18 | Six framework/total byte budgets each for JSX rows, TSRX TodoMVC, and TSRX chat; values exceed their budgets by 0.13–1.18%. |
| Three renderer | 1 | `update_1k`: Octane/R3F 1.073 against a 1.05 ceiling. |

The 18 byte breaches measure the unchanged release source and its frozen
lockfile; this refresh changes neither emitted benchmark code nor budgets.
They are release-source budget overruns, not growth caused by updating the
website records. The Three timing breach is retained as measured and remains
an observation on this shared machine, not proof of a release regression.
Neither result is hidden by raising thresholds or selecting a different run.
This snapshot must not be described as passing `--ratios`.

Existing follow-ups are the separate
[byte-budget refresh (#1638)](https://github.com/octanejs/octane/pull/1638) and
[Three retained-mesh update optimization (#1665)](https://github.com/octanejs/octane/pull/1665).
Those changes are outside the measured 0.8.0 release snapshot.
