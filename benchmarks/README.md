# Octane benchmarks

A set of self-contained benchmark suites, each a pnpm workspace of fixture apps
(octane + reference frameworks) plus a Playwright/Node harness. Every suite can
be run on its own; **`benchmarks/bench.mjs` is the unified runner** that boots the
servers, drives every harness, collects machine-readable results, and enforces
regressions — it is what makes the numbers load-bearing.

Each suite has its own `README.md` describing what it measures and which octane
subsystem a bad number points at. This file documents the **runner and the
result contract**.

The comparative suites include native Preact and Svelte 5 fixtures alongside
the existing React, Solid, Ripple, and Vue Vapor references. Preact fixtures use
`preact`/`preact/hooks` directly (with `preact/compat` only for APIs such as
portals, Suspense, and `flushSync`); Svelte fixtures use runes, keyed `#each`,
modern event attributes, and the public imperative APIs. Framework-specific
capability gaps stay explicit: Svelte's public server renderer is buffered, so
`streaming-ssr` reports no Svelte target rather than wrapping buffered HTML in a
fake stream. `codegen-size`, `dbmon-deopt`, and `js-framework-deopt` remain
Octane-only by design.

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

Some suites need no preview servers: **news** vite-builds and times each target
itself (the runner loops its per-target invocations and merges them),
**ssr-throughput**, **streaming-ssr**, and **lynx-list** are Node-only,
**ssr-http** and **tanstack-start** boot (and kill) their own production HTTP
servers per sample — that spawn/listen/first-byte cycle IS the measurement —
and **codegen-size** / **bundle-size** / **three-bundle-size** are
deterministic build/byte checks.

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

The DOM-heavy browser suites use `lib/dom-nodes.mjs` to publish a deterministic
census alongside timings. `nodes_*`, `elements_*`, `text_*`, `comments_*`,
`empty_text_*`, and `whitespace_text_*` are zero-variance operations suitable
for ratio guards; detailed comment-payload and parent-element histograms live
under `meta.dom`. Count the fixture root (`#main`, with `#app` fallback) unless
the behavior intentionally escapes it: portal-swarm records both `#main` and
the whole body so target-side portal ranges stay visible. Keep visible
elements/text as independent guards—a lower total obtained by dropping
user-visible content is a correctness failure, not an optimization.

Compiler-sensitive work counts use a separate production `work.mjs` invocation
with jitless Chromium precise call coverage. This avoids source probes changing
purity or memoization. Such invocations emit unique `*-work` target names, omit
`iterations` so they cannot overwrite the timing run's sample count, and fail on
missing production-asset coverage, exact semantic-write mismatches, or increases
above exhaustive scaffolding ceilings. Specialized component-slot variants use
aggregate ceilings so a cheaper lowering may replace a generic slot without
turning an optimization into a gate failure.

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
| `weather-app` | weather-app | octane-tsrx, react, preact, solid, svelte, vue | upstream weather UI: cold ready, keyed forecast churn, async search/error/recovery |
| `weather-app-lighthouse` | weather-app | octane-tsrx, react, preact, solid, svelte, vue | desktop Lighthouse categories plus FCP/LCP/Speed Index/TBT/CLS |
| `chat-stream` | chat-stream | Octane + reference frameworks | deterministic token streaming + conversation switches |
| `dbmon` | dbmon | Octane + reference frameworks | per-cell update churn |
| `recursive-context` | recursive-context | Octane + reference frameworks | context fan-out |
| `signal-favoring` | signal-favoring | Octane + reference frameworks | cascade vs targeted |
| `news` | news | none (builds) | SSR + hydration, per-target |
| `effectful-list` | effectful-list | Octane + reference frameworks | effect/ref cleanup churn |
| `memo-wall` | memo-wall | Octane + reference frameworks | memo bail + context walk |
| `portal-swarm` | portal-swarm | Octane + reference frameworks | portal render/dispatch |
| `ssr-throughput` | ssr-throughput | none (Node-only) | comparative news SSR + Octane-only stress fixtures |
| `streaming-ssr` | streaming-ssr | none (Node-only) | streaming targets incl. Preact; Svelte N/A |
| `ssr-http` | ssr-http | none (boots its own node:http hosts) | raw streaming API over real HTTP: fresh-process import cost, cold spawn→listen→first-byte, warm shell/total/throughput (octane vs React Fizz, streaming-ssr fixtures) |
| `ssr-workerd` | ssr-workerd | none (boots workerd via miniflare) | streaming SSR inside the real Cloudflare Workers runtime: cold isolate→first-byte, warm shell/total, worker-script bytes (octane vs Fizz edge, plus the vite-plugin + adapter-cloudflare deployment shape) |
| `tanstack-start` | tanstack-start | none (boots its own production servers) | the real Start app pair, correctness-gated: cold TTFB + warm per-route TTFB/stream/throughput across react, octane-minimal, octane-nitro |
| `dbmon-deopt` | dbmon | octane-tsrx + octane-deopt | tuned vs plain-.ts cliff |
| `js-framework-deopt` | js-framework | octane-tsrx + naive triplet | tuned vs naive-authoring cliff |
| `async-waterfall` | async-waterfall | octane-tsrx, react, preact, solid, svelte, ripple | 10-level nested async: `use()` waterfall vs parallel-by-model signals (init + transition update) |
| `async-composition` | async-composition | octane-tsrx, react | dashboard composition: adjacent async panels, nested children, imported custom hook, and one true dependency |
| `lynx-list` | lynx-list | none (Node-only) | deterministic 1,000-row native-list physical allocation, reuse, and teardown through a fake Element PAPI |
| `codegen-size` | codegen-size | none (Node-only) | compiled-output bytes: fixed corpus through octane/compiler, raw/min/gzip, `compiled` vs `source` |
| `bundle-size` | bundle-size | none (builds) | shipped JS bytes: production builds of js-framework, TodoMVC, chat-stream, and weather-app, normalized minify, raw/gzip/brotli |
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
