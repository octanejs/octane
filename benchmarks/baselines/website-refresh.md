# Website benchmark refresh — main, 21 October 2026

The website imports 29 records from `local/`. The `signal-favoring` record was
refreshed separately with native Octane signals as described below. The other 28
records retain the original full snapshot, including its two auxiliary diagnostic
failures and 16 performance-guard breaches. The homepage's 20 summary rows and
bundle-size ranges are recomputed with `createHomeSummary(FRAMEWORK_CARDS)`.

## Native-signals refresh — 21 October 2026

Both Octane variants in `signal-favoring` now use component-owned `useSignal$`
and direct signal text bindings. The same 100-component chain, ten independent
counters and adapter flush boundaries remain; peer fixture sources and locked
dependency versions are unchanged. The measured compiler also fixes direct
signal children in rendered return-JSX host components, with matching server
lowering for hydration.

- Measured revision:
  [`e96875266d87c4dc0945530628ce0ea8b90e3830`](https://github.com/octanejs/octane/commit/e96875266d87c4dc0945530628ce0ea8b90e3830),
  based on main `1c69b865d46da1425799b7bcb4923d3bcc11017e` plus the native-signals
  fixture/compiler changes (package version 0.14.1). This is a source snapshot,
  not a measurement of the published release.
- [Measurement run](https://github.com/octanejs/octane/actions/runs/39607694772):
  `full: true`, `suites: signal-favoring`; five warmups and 20 timing samples,
  with all nine framework targets measured in one invocation. The record also
  includes the two ABBA dialect aliases and two deterministic work targets:
  13 targets and 208 target/operation measurements in total.
- Environment recorded at 13:25:49 UTC: AMD EPYC, four vCPUs, Linux 6.6.141 x64,
  Node 24.19.0, pnpm 12.9.1, Playwright 1.61.1 and Chromium 149.0.7827.55.
  The run uses the same frozen peer versions listed for the original snapshot.
- All semantic gates, both deterministic work gates and both applicable ratio
  guards passed. Every timing score is finite and positive. Both Octane variants
  perform zero block/slot/descriptor work and one text write per individual bump,
  or ten writes per batched bump. Mount and teardown costs are still measured.

Sweeps now calibrate repetitions to about 20 ms for every framework, retaining
one awaited adapter flush per update. Individual bumps already used this
calibration approach. Primary timing records include `repeat` and `sampleMs`;
ABBA aliases combine normalized samples. This avoids zero timings for very fast
signal updates. Sweep timings must not be presented as direct speedups over the
previous fixed 25-repetition protocol. No ratio threshold or waiver changed.

To reproduce, check out the measured revision above, install the frozen lockfile
and Playwright Chromium as below, then run:

```sh
node benchmarks/bench.mjs --ratios signal-favoring
```

Only `local/signal-favoring.json` was imported from this run's `bench-results`
artifact, without changing its values. Target/operation names and sample counts
match the previous record. Only the signal-favoring homepage summary row changes;
all other summary rows and bundle-size ranges retain the original snapshot.
The remaining sections describe that original full run, not this successful
partial refresh.

## Original full snapshot: source and environment

- Measured Octane main revision:
  [`80d230b879a6234d2f204ddddb189ca25fd6e81f`](https://github.com/octanejs/octane/commit/80d230b879a6234d2f204ddddb189ca25fd6e81f)
  (package version 0.14.0). This is a source snapshot, not a measurement of
  the published Octane release or subsequent main changes.
- [Measurement run](https://github.com/octanejs/octane/actions/runs/39589619827):
  all 29 suites ran sequentially in one CI job with `full: true`.
  Measurements ran on 21 October 2026, 11:09:06–11:51:34 UTC
  (12:09:06–12:51:34 Europe/London).
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

This run used an AMD EPYC runner; the previous snapshot used Intel Xeon.
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
the Bench workflow's `full: true` input. The 29 suite JSON files, including the two diagnostic failure flags, were imported
from its `bench-results` artifact and formatted without changing their values.
The artifact's `environment.json` supplies the environment above. No quick-run
results are substituted, and no guard thresholds are changed.

## Import validation and diagnostic failures

The records contain 222 targets and 2,861 target/operation measurements. All
framework timing targets and charted operations remain present, with finite
scores. Iteration counts, repetition counts, and fixed sample counts match the
previous snapshot; duration-based SSR throughput counts vary with the number
of renders completed. The calibrated JS Framework batching metadata is present.

Twenty-seven suite harness aggregates passed. The primary timing harnesses in
`memo-wall` and `recursive-context` also passed their semantic gates, but their
auxiliary diagnostics failed, leaving both aggregates at `harnessExit: 1`:

- `memo-wall/survivor-work.mjs` could not find its exact source-instrumentation
  string (`one root commit loop`). The runtime commit loop changed; the probe
  stopped before measuring journal slots or function calls. The `survivor-work`
  target is absent rather than copied from the old snapshot.
- `recursive-context/context-cache-work.mjs` measured 6, 518, and 1,030 mount
  Maps for zero, one, and two context reads across 512 rows. Extra consumer Maps
  were 512/1,024 against the unchanged 0/512 budget. DOM values, retained row
  identity, reorder, and teardown checks completed before that allocation gate
  threw. This is an allocation-budget failure, not a passing diagnostic. The
  enclosing `work.mjs` emitted no result, so all 13 of its `*-work` targets are
  absent, including coverage, compiler controls, warm adoption, and context-cache
  counters. None of these targets feeds a website chart.

The raw records retain the exact `failed` strings. This is a timing snapshot
with incomplete diagnostics, not a fully passing benchmark run. Repairing the
memo-wall probe and investigating the context allocation increase remain
follow-ups; this refresh changes neither runtime code nor diagnostic budgets.
The four newly collected memo-wall provider-scope targets and the additional
bundle-size fixture operations are retained in the raw records.

## Ratio guards

The run checked 171 applicable paired ratio guards: 155 passed and 16 breached
their bounds. None has a waiver. The measurement workflow failed for these
breaches and the two diagnostic failures above. Missing diagnostic measurements
cannot count as passing guards.

| Suite / operation | Target / reference | Observed ratio | Maximum |
| --- | --- | ---: | ---: |
| `memo-wall` / `one_change_A` | `octane-jsx` / `octane-tsrx` | 20.8429× | 10× |
| `memo-wall` / `ctx_through_wall_A` | `octane-jsx` / `octane-tsrx` | 2.9600× | 2.25× |
| `bundle-size` / `app_gzip` | `octane-jsx` / `octane-tsrx` | 1.3689× | 1.25× |
| `bundle-size` / `app_gzip` | `octane-tsrx` / `ripple` | 1.0730× | 0.98× |
| `bundle-size` / `app_gzip` | `octane-tsrx` / `solid` | 1.3450× | 1.23× |
| `bundle-size` / `todo_app_gzip` | `octane-tsrx` / `solid` | 2.2263× | 1.82× |
| `bundle-size` / `todo_app_gzip` | `octane-tsrx` / `ripple` | 1.3558× | 1.11× |
| `bundle-size` / `chat_app_gzip` | `octane-tsrx` / `solid` | 1.5547× | 1.34× |
| `bundle-size` / `chat_app_gzip` | `octane-tsrx` / `ripple` | 1.2884× | 1.11× |
| `bundle-size` / `app_gzip` | `octane-tsrx` / `svelte` | 1.1637× | 1.06× |
| `bundle-size` / `todo_app_gzip` | `octane-tsrx` / `svelte` | 1.9237× | 1.57× |
| `bundle-size` / `chat_app_gzip` | `octane-tsrx` / `svelte` | 1.4314× | 1.24× |
| `bundle-size` / `weather_app_gzip` | `octane-tsrx` / `react` | 1.1431× | 1.06× |
| `three-bundle-size` / `js_gzip` | `octane-min` / `r3f-min` | 1.0350× | 1.034× |
| `three-bundle-size` / `js_gzip` | `octane-full` / `r3f-full` | 1.0241× | 1.024× |
| `svg-dashboard` / `select_toggle` | `octane-tsrx` / `solid` | 1.2584× | 0.9× |

These are the unmodified measurements from the single full run. No suite was
rerun to improve its ranking; no guard bound or waiver changed. Bundle byte
breaches are deterministic for this source/toolchain and need source analysis;
timing differences require controlled measurement to separate regressions from
runner variation. The source revision remains the measured commit even if the
refresh PR incorporates a later release commit for branch currency.
