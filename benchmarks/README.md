# Octane benchmarks

A set of self-contained benchmark suites, each a pnpm workspace of fixture apps
(octane + reference frameworks) plus a Playwright/Node harness. Every suite can
be run on its own; **`benchmarks/bench.mjs` is the unified runner** that boots the
servers, drives every harness, collects machine-readable results, and enforces
regressions — it is what makes the numbers load-bearing.

Each suite has its own `README.md` describing what it measures and which octane
subsystem a bad number points at. This file documents the **runner and the
result contract**.

The comparative suites include native Inferno 9, Preact, and Svelte 5 fixtures
alongside the existing React, Solid, Ripple, and Vue Vapor references. Inferno
fixtures use `inferno`, `inferno-server`, `inferno-hydrate`, and
`babel-plugin-inferno` directly rather than a React compatibility layer. Preact fixtures use
`preact`/`preact/hooks` directly, including native scheduler timing, with
`preact/compat` only for React-shaped APIs that core does not expose, such as
portals, Suspense, `memo`, and `useSyncExternalStore`; Svelte fixtures use runes,
keyed `#each`, modern event attributes, and the public imperative APIs. Framework-specific
capability gaps stay explicit: Svelte's public server renderer is buffered, so
`streaming-ssr` reports no Svelte target rather than wrapping buffered HTML in a
fake stream. `codegen-size`, `dbmon-deopt`, and `js-framework-deopt` remain
Octane-only by design.

### Inferno coverage

Inferno is included in every framework-comparative benchmark whose contract can
be implemented through Inferno's public browser or Node APIs:

- browser workloads: js-framework (including reorder), TodoMVC, weather and
  Lighthouse, chat-stream, SVG dashboard, UIbench, dbmon, recursive context,
  SPA navigation, signal-favoring, effectful-list, portal-swarm, async waterfall,
  and async composition;
- the shared news fixture: SSR/hydration, hydration interactivity and stress,
  lifecycle memory, controlled forms, external-store fan-out and integrations,
  selector fan-out, scheduler responsiveness, suspense recovery, event
  delegation, application composition, and scaling curves;
- server and build workloads: SSR throughput, streaming SSR, HTTP streaming,
  streaming backpressure, compiler throughput, and bundle size; and
- the real Tauri desktop shell.

Capability exclusions stay explicit. `memo-wall` records Inferno as N/A because
Inferno 9 only exposes legacy context, whose consumers cannot observe an update
through an ancestor that returns `false` from `shouldComponentUpdate`.
`activity` requires React/Octane Activity semantics, and `ssr-workerd` requires a
Web Streams/Worker renderer while Inferno exposes a Node stream. React-hosted,
binding-specific, metaframework, Three, Lynx, universal-driver, compiler-deopt,
and Octane-internal suites are not general framework matrices, so they do not
gain an artificial Inferno row.

### React Compiler

Every primary React benchmark uses the production React Compiler 1.0 through
Vite's official React Compiler preset. The shared
[`react-compiler.mjs`](react-compiler.mjs) integration also compiles server,
Worker, and `.tsrx` fixtures, so SSR comparisons receive the same treatment as
browser-rendered React. The memo-wall suite additionally keeps an explicitly
labeled uncompiled React control to isolate the compiler's effect without
changing the primary compiled React comparison.

## Quick start

```bash
node benchmarks/bench.mjs                       # every suite, normal iterations
node benchmarks/bench.mjs js-framework memo-wall   # only these suites
node benchmarks/bench.mjs --quick js-framework  # reduced-iteration smoke pass
node benchmarks/bench.mjs --list                # list suite names
pnpm bench:all -- --quick                        # same via the root script
```

For server-backed browser suites, the runner first production-builds each fixture
app (`pnpm --filter <pkg> build`), starts its preview server
(`pnpm --filter <pkg> preview`), waits for the strict port, runs the harness with
`BENCH_JSON` pointed at a temp file, then kills the server **by port**
(`lsof -ti tcp:<port>`). Suites run **sequentially** so ports and CPU never
contend. A fixture is built at most once per runner invocation, even if multiple
suites reuse it. Collected results land in `benchmarks/results/<suite>.json`
(gitignored), one file per suite.

Some suites need no preview servers: **news**, **hydration-interactivity**, and
the three runtime-stress suites vite-build and time each target themselves (the
runner loops their per-target invocations and merges them),
**ssr-throughput**, **streaming-ssr**, **lynx-list**, **universal-leaf-update**,
**universal-external-store**,
**lynx-render**, and **lynx-bundle-size** are Node-only,
**ssr-http** and **tanstack-start** boot (and kill) their own production HTTP
servers per sample — that spawn/listen/first-byte cycle IS the measurement —
and **codegen-size** / **bundle-size** / **bundle-reachability** /
**three-bundle-size** /
**lynx-bundle-size** are deterministic build/byte checks.

## Regression modes

| flag | what it does | fails the run? |
| --- | --- | --- |
| `--record` | write current numbers to `baselines/local/<suite>.json` | no |
| `--compare` | diff current numbers vs `baselines/local/<suite>.json` | on any regression |
| `--ratios` | check `baselines/ratios.json` guards | on any breach |
| `--quick` | reduced iterations / seconds per suite | — |
| `--baseline-dir=<dir>` | override the absolute-baseline dir | — |
| `--results-dir=<dir>` | override where per-suite JSON is written | — |

**What fails CI vs what is local-only:**

- **CI enforces `--ratios` only.** Ratio guards compare two targets measured on
  the *same machine in the same run*. That cancels shared variation; byte/count
  ratios are deterministic for a fixed toolchain, while timing guards retain
  explicit noise headroom. `.github/workflows/bench.yml` runs
  `node benchmarks/bench.mjs --quick --ratios` on manual dispatch + a weekly
  cron, uploads `benchmarks/results/` as an artifact, and fails on a breach.
- **`--record` / `--compare` are local-only.** Absolute timing baselines are
  specific to the recording machine; deterministic byte/count records are
  portable only across the same fixture and toolchain. Neither is a CI gate. See
  [`baselines/README.md`](baselines/README.md).

The **compare rule** is noise-aware: an op is a regression only if
`score > 1.15× baseline` **and** `min > 1.10× baseline`; for sub-1ms ops it must
also exceed the baseline score by an absolute >0.1ms. Existing median-only
baselines fall back to `median`, so old records remain readable.

**Refreshing ratio guards:** `node benchmarks/bench.mjs --record --ratios <suites>`
writes `baselines/ratios.suggested.json` (observed ratio × 1.5) **without**
overwriting `ratios.json`. Review and hand-copy — never auto-ratchet the gate.

## BENCH_JSON contract

Every harness, when `process.env.BENCH_JSON` is set, writes that path (overwrite)
after printing its normal tables:

```json
{
  "suite": "js-framework",
  "iterations": 8,
  "targets": [
    { "name": "octane-tsrx",
      "ops": {
        "run": {
          "score": 1.58,
          "median": 1.6,
          "min": 1.5,
          "mean": 1.62,
          "p95": 1.8,
          "sd": 0.1,
          "rme": 4.2,
          "warmupRatio": 1.08,
          "samples": 8
        }
      },
      "meta": { "…": "correctness counters / bytes go here" } }
  ]
}
```

- Timing operations are **milliseconds**. `score` is the headline value for comparisons:
  the mean of the latest stable sample window (or `median` when a quick run has
  too few samples to infer a window). This mirrors Benchmark.js's preference for
  mean period + uncertainty over median-only reporting, while keeping sample
  order visible enough to catch residual JIT warmup. `median`, `min`, `p95`,
  `sd`, `rme` and `warmupRatio` are diagnostics; ops/sec suites add `opsPerSec`.
  Independent cold samples whose order does not represent warmup use the full
  sample mean via `summarizeSamples(samples, { scoreMode: 'mean' })`.
  Non-timing extras (payload bytes, render counters, gate status) go under a
  per-target `meta` object.
- On a **correctness-gate failure** the harness still writes the JSON but adds a
  top-level `"failed": "<reason>"` and exits non-zero. The runner surfaces this
  (`harnessExit`) and treats it as fatal unless the suite has an active,
  expiry-dated waiver in `HARNESS_FAILURE_ALLOWLIST`.
- Every harness also accepts an **iterations argv** (`node run.mjs [iter]`, or
  after the target name for news) so the runner can drive reduced smoke passes.
  ssr-throughput is time-budgeted: its knob is a per-config seconds value and
  `--quick` passes the harness's own `--quick`.

Some DOM-heavy browser suites, including TodoMVC, chat-stream, and portal-swarm,
use `lib/dom-nodes.mjs` to publish a deterministic census alongside timings.
TodoMVC and chat-stream expose `nodes_*`, `elements_*`, `text_*`, `comments_*`,
`empty_text_*`, and `whitespace_text_*` as zero-variance operations suitable for
ratio guards; detailed comment-payload and parent-element histograms live under
`meta.dom`. Count the fixture root (`#main`, with `#app` fallback) unless the
behavior intentionally escapes it: portal-swarm records both `#main` and the
whole body so target-side portal ranges stay visible. Keep visible elements/text
as independent guards—a lower total obtained by dropping user-visible content
is a correctness failure, not an optimization. The js-framework suites report
timings without a DOM census.

Compiler-sensitive work counts use a separate production `work.mjs` invocation
with jitless Chromium precise call coverage. This avoids source probes changing
purity or memoization. Such invocations emit unique `*-work` target names, omit
`iterations` so they cannot overwrite the timing run's sample count, and fail on
missing production-asset coverage or semantic-write mismatches. Established
optimization guards also fail on increases above exhaustive scaffolding
ceilings; a new baseline suite reports work without guessing a cost ceiling
before its pinned-toolchain run. Specialized component-slot variants use
aggregate ceilings so a cheaper lowering may replace a generic slot without
turning an optimization into a gate failure.
The shared collector's optional `after` hooks verify the result after taking the
coverage snapshot, keeping event-based semantic probes out of the measured work.
Unhandled page errors and console errors fail the work sample even when its
semantic hooks complete.

When a dialect timing ratio is important, suites may emit
`octane-{tsrx,jsx}-dialect-pair` aliases. Those aliases combine fully-warmed raw
samples from a TSRX→TSX→TSX→TSRX sequence with an independent-run mean; the
original one-pass rows remain unchanged for cross-framework comparisons.

The runner keys everything (result files, baselines, ratio guards) by the
**manifest suite name**, not the JSON's internal `suite` field — so the deopt
variants (`dbmon-deopt`, `js-framework-deopt`), which reuse a base harness via a
`TARGETS` pairing and therefore write `suite: "dbmon"` / `"js-framework"`
internally, get their own baseline and guard namespace.

## Suites

| manifest name | dir | servers | notes |
| --- | --- | --- | --- |
| `js-framework` | js-framework | Octane + reference frameworks | krausest ops incl. `add` |
| `js-framework-reorder` | js-framework | same fixtures | keyed reorder matrix (LIS vs lastPlacedIndex) |
| `todomvc` | todomvc | Octane + reference frameworks | Speedometer-style TodoMVC interactions |
| `weather-app` | weather-app | octane-tsrx, react, preact, solid, svelte, vue, inferno | upstream weather UI: cold ready, keyed forecast churn, async search/error/recovery |
| `weather-app-lighthouse` | weather-app | octane-tsrx, react, preact, solid, svelte, vue, inferno | desktop Lighthouse categories plus FCP/LCP/Speed Index/TBT/CLS |
| `chat-stream` | chat-stream | Octane + reference frameworks | deterministic token streaming + conversation switches |
| `streamdown-hosted` | streamdown-hosted | React Streamdown + React-hosted Octane binding | React-hosted compatibility boundary: static mount/replace, fine/coarse Markdown streaming, semantic DOM parity, lifecycle diagnostic, and production bytes |
| `svg-dashboard` | svg-dashboard | octane-tsrx, react, solid, svelte, inferno | hand-rolled SVG observability dashboard: path-d/transform churn, keyed reconcile inside `<svg>`, foreignObject labels, portal tooltip overlay, createElement icon de-opt; byte-exact Node-replay + cross-flavor DOM-parity gates |
| `uibench` | uibench | octane-tsrx, react, preact, solid, ripple, vue-vapor, inferno | fresh implementation of UIbench's 96-case desktop matrix: table/sparse-style updates, flat and nested keyed tree transforms, historical worst cases, large no-change diffs, and semantic/identity gates |
| `dbmon` | dbmon | Octane + reference frameworks | per-cell update churn |
| `recursive-context` | recursive-context | Octane + reference frameworks | context fan-out |
| `spa-navigation` | spa-navigation | octane-tsrx, octane-jsx, react, solid, vue-vapor, inferno | full-page routed-subtree teardown/mount with shell/layout identity and production-work gates |
| `signal-favoring` | signal-favoring | Octane + reference frameworks | cascade vs targeted |
| `scoped-signals` | scoped-signals | none (Node-only) | same-version Alien 3.2.0/scoped-engine graphs, intermediate notification/value gates, and continuous partial disposal with unrelated live owners; optional separate heap diagnostics |
| `news` | news | none (builds) | SSR + hydration, per-target |
| `hydration-interactivity` | hydration-interactivity | none (builds) | real pre-hydration typing, controlled inputs, native event replay, and 1×/6× Chromium CPU throttling across Octane, React, Preact, Solid 2, Svelte, Vue Vapor, and Inferno |
| `hydration-stress` | hydration-stress | none (builds) | withheld-chunk hydration, keyboard and pointer Send delivery, DOM adoption, and explicit replay/drop diagnostics at 6× CPU throttling |
| `lifecycle-memory` | lifecycle-memory | none (builds) | 1,000+ effectful mount/update/unmount cycles, real listener/subscription/timer cleanup, post-teardown event probes, and explicitly collected Chromium heap across all seven frameworks |
| `controlled-form` | controlled-form | none (builds) | 512 controlled fields, real typing, DOM identity, focus and caret, validation cancellation, complete submit/reset, and native select/checkbox/radio correctness |
| `dev-form-diagnostics` | dev-form-diagnostics | none (Node/jsdom) | development-only controlled-form diagnostic commit scaling at 4,000 and 32,000 hosts |
| `scheduler-depth` | scheduler-depth | none (Node/jsdom) | production client scheduler ordering across 500 and 2,000 deeply nested queued components |
| `hydration-range-compaction` | hydration-range-compaction | none (Node/jsdom) | production SSR hydration range compaction across 64 and 512 coextensive wrappers, with adoption, interaction, marker-depth, and unmount gates |
| `external-store-fanout` | external-store-fanout | none (builds) | 512 subscribers, narrow and broad writes, rapid-write tearing checks, deterministic 100-notification work guards, and balanced subscription removal |
| `external-store-integrations` | external-store-integrations | none (builds) | real Zustand stores, Jotai atoms, and TanStack Query caches with selector fan-out, query invalidation, and seven-framework cleanup gates |
| `store-selector-fanout` | store-selector-fanout | none (builds) | 512 subscribers reading one store through a `with-selector`-shaped selector, 20 unrelated parent re-renders with the store untouched, and deterministic selector-invocation counts beside render and snapshot counts |
| `hook-store-composition` | hook-store-composition | none (builds) | matched direct/nested callbacks and actual Octane Zustand traditional/MobX bindings; separate production timings, named-work counts, and observable identity/update/cleanup controls |
| `scheduler-responsiveness` | scheduler-responsiveness | none (builds) | real controlled typing during eight 512-subscriber store updates at 6× CPU throttling, with focus, caret, frame, and notification gates |
| `suspense-recovery` | suspense-recovery | none (builds) | seven-framework visible async pending, rejection, retry, cancellation, and stale-response correctness |
| `event-delegation` | event-delegation | none (builds) | 128 real native input events, 512 event-bearing hosts, capture/bubble accounting, and every controlled output |
| `behavior-root-events` | behavior-root-events | none (headless Chromium) | queued events across 1,000 and 8,000 distinct async behavior adoptions, with FIFO/exactly-once gates |
| `application-composition` | application-composition | none (builds) | lifecycle resources, large forms, store fan-out, async recovery, form submission, and navigation teardown in one app |
| `scaling-curves` | scaling-curves | none (builds) | independently correctness-gated controlled updates at 8, 32, 96, 256, and 512 components |
| `radix-collection-order` | radix-collection-order | none (Node-only) | production Radix collection ordering versus the prior comparator at 16, 64, 256, and 4,096 items, with missing-ref and stable-order controls |
| `router-dispatch` | router-dispatch | none (Node-only) | app-core static, wrong-method, and dynamic matching across 1,000-route tables |
| `floating-tree-navigation` | floating-tree-navigation | none (Node-only) | Floating UI deepest-open-node lookup on deep chains, equal-depth forks, and a root-only control, with exact previous-behavior and deterministic node-read gates |
| `ink-cursor-update` | ink-cursor-update | none (Node-only) | Ink standard/incremental cursor-only updates over equal 20,000-line frames, with exact previous branches, byte/split gates, stable-frame stress scaling, and initial/changed-render controls |
| `manifest-cache-invalidation` | manifest-cache-invalidation | none (Node-only) | shared-compiler source invalidation across 129 and 5,001 cached nearest-manifest decisions, plus a required manifest-scan control |
| `vite-client-assets` | vite-client-assets | none (Node-only) | route asset mapping across 100 and 1,000 entries sharing a 500-chunk manifest graph, plus a shallow control |
| `effectful-list` | effectful-list | Octane + reference frameworks | effect/ref cleanup churn |
| `activity` | activity | none (builds) | same-source Octane/React Activity lifecycle, hidden/nested work, retained state/effects/DOM, cold-vs-used ordinary-ref controls, and optional-runtime bundle reachability |
| `list-clear` | list-clear | Octane-only | keyed-list bulk clear by parent shape — the only coverage of the shared-parent path |
| `memo-wall` | memo-wall | Octane + reference frameworks | memo bail + context walk |
| `portal-swarm` | portal-swarm | Octane + reference frameworks | portal render/dispatch |
| `ssr-throughput` | ssr-throughput | none (Node-only) | comparative news SSR including Inferno + Octane-only stress fixtures |
| `streaming-ssr` | streaming-ssr | none (Node-only) | streaming targets incl. Inferno and Preact; Svelte N/A |
| `ssr-http` | ssr-http | none (boots its own node:http hosts) | raw streaming API over real HTTP: fresh-process import cost, cold spawn→listen→first-byte, warm shell/total/throughput across the streaming-ssr fixtures |
| `streaming-backpressure` | streaming-backpressure | none (builds) | real one-byte Node Writable pressure, delayed drains, three concurrent destinations, and public-stream abort across supported renderers |
| `ssr-workerd` | ssr-workerd | none (boots workerd via miniflare) | streaming SSR inside the real Cloudflare Workers runtime: cold isolate→first-byte, warm shell/total, worker-script bytes (octane vs Fizz edge, plus the vite-plugin + adapter-cloudflare deployment shape) |
| `tanstack-start` | tanstack-start | none (boots its own production servers) | the real Start app pair, correctness-gated: cold TTFB + warm per-route TTFB/stream/throughput across react, octane-minimal, octane-nitro |
| `dbmon-deopt` | dbmon | octane-tsrx + octane-deopt | tuned vs plain-.ts cliff |
| `js-framework-deopt` | js-framework | octane-tsrx + naive triplet | tuned vs naive-authoring cliff |
| `async-waterfall` | async-waterfall | octane-tsrx, react, preact, solid, svelte, ripple, inferno | 10-level nested async: `use()` waterfall vs parallel-by-model signals (init + transition update) |
| `async-composition` | async-composition | octane-tsrx, react, inferno | dashboard composition: adjacent async panels, nested children, imported custom hook, and one true dependency |
| `lynx-list` | lynx-list | none (Node-only) | deterministic 1,000-row native-list physical allocation, reuse, and teardown through a fake Element PAPI |
| `universal-leaf-update` | universal-leaf-update | none (Node-only) | universal update locality beside 0–4,000 unrelated component siblings through the compiler and native object driver: plain leaf `setState`, keyed `@for` item state, a leaf under an idle `@try`, a structural (insert/remove) update, and compact-row list selection |
| `universal-external-store` | universal-external-store | none (Node-only) | 128 native universal store subscribers, getter/subscribe identity controls, notification bursts, and deterministic subscription-lifetime and state-projection guards |
| `lynx-render` | lynx-render | none (Node-only) | dual-thread Lynx render CPU: empty startup, create 1,000 and 10,000 keyed rows through the real background root, transport, and main receiver over a cheap fake Element PAPI, plus a gate that a native tap reaches its background handler via the engine `publishEvent` receiver |
| `lynx-table` | lynx-table | none (Node-only; separate Chromium harness) | deterministic per-operation wire cost of the cross-framework krausest table (command counts and serialized commit bytes vs a changed-rows floor) through the real dual-thread path and real tap tokens |
| `lynx-table-web` | lynx-table | none (headless Chromium) | Lynx-for-Web wall clock: the same table app for Octane and the vendored ReactLynx / Vue Lynx reference bundles under one byte-identical page driver; host-bound medians, no ratio guards |
| `lynx-bundle-size` | lynx-bundle-size | none (builds) | semantic-checksummed production Rspeedy artifact bytes for background preview and dual-thread IFR modes; source/build evidence only |
| `codegen-size` | codegen-size | none (Node-only) | compiled-output bytes: fixed corpus through octane/compiler, raw/min/gzip, `compiled` vs `source` |
| `hook-memo` | hook-memo | none (Node-only) | production hook-memo compiler on/off, clean semantic controls, deterministic function/array creation events, and compiled/bundled bytes |
| `template-call-memo` | template-call-memo | none (Node-only) | production Strong/compatibility receiver-call counts, immutable keyed rows, real dependency changes, current event captures, and survivor identity |
| `compiler-throughput` | compiler-throughput | none (Node-only) | seven real production compiler pipelines, cold/warm/incremental transformations, 10/100/1,000 components, and heap diagnostics |
| `tsrx-component-graph` | tsrx-component-graph | none (Node-only) | 2,400-component live-import propagation with dependent-first vs dependency-first declarations |
| `tsrx-jsx-return-branches` | tsrx-jsx-return-branches | none (Node-only) | client/server compile and bundler classification for 120/480 conditional-return components, with lowering/export controls and a same-sized ineligible parse/print control |
| `tsrx-nesting-diagnostics` | tsrx-nesting-diagnostics | none (Node-only) | development TSRX compilation at 500 and 2,000 invalid HTML sites, with parsed diagnostic count/order controls and a per-diagnostic scaling guard |
| `tsrx-renderer-selection` | tsrx-renderer-selection | none (Node-only) | ordered filename-to-renderer classification with semantic checksums, comparing retained normalized config against equivalent raw revalidation |
| `tsrx-native-change-analysis` | tsrx-native-change-analysis | none (Node-only) | native-onChange analysis plus client/server compilation for 500/4,000 hostless JSX sites, paired with an AST-identical marker control that conservatively forces the scan |
| `bundle-size` | bundle-size | none (builds) | shipped JS bytes: production builds of js-framework, TodoMVC, chat-stream, and weather-app, normalized minify, raw/gzip/brotli |
| `bundle-reachability` | bundle-size | none (builds and executes in jsdom) | isolated public feature imports, exact production-bundle behavior, forbidden-module reachability, and committed raw/gzip/brotli budgets |
| `three-renderer` | three | Octane Three, R3F, plain Three | 1,000-object lifecycle, reconstruction/disposal, frame subscribers, and raycast events |
| `three-bundle-size` | three | none (builds, then checks in Chromium) | minimal/full-catalogue shipped JS bytes for Octane Three, R3F, and plain Three |

The size suites measure **bytes, not milliseconds** (deterministic —
`median === min`, and ratio guards on them are exact, hardware-independent
numbers). They are the regression gates for
`docs/compiled-output-optimization-plan.md`: `codegen-size` is the seconds-fast
per-commit signal (its corpus is FIXED — editing the corpus list invalidates the
baseline, re-record when you change it), `bundle-size` is the cross-framework
comparison (all targets built with one normalized minify so solid's
`minify:false` dev config and octane's terser passes don't skew the compare).
The separate `codegen-size` CSS targets also build the real Rspack/CssExtract
adapter with named exports and authenticated immutable default maps. They compare
identical source with the option off/on, keep framework imports external for byte
measurement, and verify equal emitted CSS and full-runtime SSR output. Their
same-run ratios catch an adapter that silently stops supplying compiler proofs.
`lynx-bundle-size` instead uses the pinned Rspeedy native encoder unchanged and
bounds the incremental decoded/encoded cost of IFR against the equivalent
background-rendered preview graph; its semantic checks remain source/build
evidence rather than native execution.

`bundle-size` classifies every build's emitted JavaScript into an `app` bucket
(modules under the app's own src/) and a `framework` bucket (node_modules + the
Octane workspace runtime + virtual helpers) and reports both, plus totals:
`app_*` / `fw_*` / `js_*` ×
raw/gzip/brotli. The harness models each emitted JavaScript file as an
independently compressed response and sums those modeled transfer sizes; it
does not inspect a server's content encoding. A bundler's default single chunk
can be slightly smaller through cross-module compression. The `app_*` ops are
the primary scaling ratchet as applications grow; `fw_*` tracks the one-time
runtime cost separately. App-shaped
sets use `todo_*`, `chat_*`, and `weather_*` operation prefixes; weather's shared
service and formatting modules count as app code in both framework builds.

`bundle-size/app-budgets.json` independently caps all four complete Octane TSRX
applications, while `bundle-size/jsx-budgets.json` separately caps the Octane JSX
rows application. Each fixture has application, framework, and total raw, gzip,
and brotli ceilings: forty-five deterministic limits in total. The harness
publishes those committed values as separate same-run `octane-tsrx-budget` and
`octane-jsx-budget` targets, and forty-five `maxRatio: 1` guards enforce them
alongside the existing cross-framework comparisons. Independent dialect budgets
allow either runtime to shrink without making the other dialect look larger by
comparison. Ceilings retain at least 32 bytes of headroom and are rounded to
32-byte boundaries, so small changes in another framework cannot hide Octane
application or runtime growth. Refresh a ceiling only with a reviewed explanation
and a production measurement using the pinned CI Node version.

`bundle-reachability` builds twenty-one independent public-entry feature fixtures
across twenty-eight production builds with the production Octane compiler,
disabled HMR/profiling, and normalized esbuild minification. The seven package
side-effect fixtures each run through both Vite and esbuild. Each measured IIFE
executes unchanged in an isolated jsdom realm; its visible DOM, interaction,
hydration, Suspense, server rendering, store, and cleanup behavior must match its
feature oracle. Client graphs reject server modules, while server graphs reject
the client runtime; all reject React, profiling, devtools, package-metadata, and
RPC-serialization reachability. Early
hydration-event capture and the vanilla Zustand entry must also exclude the
client runtime, while the hook binding must retain the real vanilla store.
The isolated server-hook entry also rejects unrelated DOM namespace tables, and
the component-owned-effects entry verifies that unused sibling styles, delegated
events, and ViewTransition initialization disappear while retained styles and
click handlers remain live.

The generated SPA scenario loads the actual CLI entry and complete landing-page
templates without maintaining duplicate fixture sources; its compiled bundle
must render the public page while excluding the reusable-root runtime. The two
static-root fixtures deliberately measure different public contracts.
`root-static-specialized` matches an application's disposable top-level
`createRoot(container).render(ImportedComponent)` entry, allowing the production
compiler to specialize the root. `root-static` retains an escaped, reusable
`Root`, calls `render`, and verifies `unmount`; its broader reachable runtime is
real and must not be disguised as the specialized entry.

`bundle-size/minimal-budgets.json` supplies explicit raw, gzip, and brotli byte
ceilings for every feature. Budgets leave about 3% deterministic headroom, with
small byte-aligned allowances for tiny isolated entries. Each scenario publishes
its committed ceiling as a
same-run `*-budget` reference target, so eighty-four `maxRatio: 1` entries in
`baselines/ratios.json` enforce all three metrics in the existing weekly/manual
Bench CI workflow. Run the complete executable and byte guard directly with:

```bash
node benchmarks/bench.mjs --quick --ratios bundle-reachability
```

## Adding a suite

Append an entry to the `SUITES` manifest in `benchmarks/bench.mjs`:

```js
{
  name: 'my-suite',            // baseline + ratio-guard namespace key
  cwd: 'my-suite',             // dir under benchmarks/ whose node_modules resolves the harness
  servers: [{ filter: 'my-suite-octane-bench', port: 53xx }],  // [] for build/Node-only suites
  iter: { normal: 20, quick: 3 },
  runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],     // env: () => ({ TARGETS: … }) for pairings
}
```

Each server-backed fixture package must provide `build` and `preview` scripts;
the preview script must bind the manifest port with `--strictPort`. The harness
must implement the BENCH_JSON contract above. For a suite that runs one harness
per target (like news), give `runs` multiple entries — their `targets` arrays
are concatenated into one result. Add ratio guards for the new suite to
`baselines/ratios.json` and (optionally) `--record` local baselines.
