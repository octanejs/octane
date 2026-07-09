# Octane benchmarks

A set of self-contained benchmark suites, each a pnpm workspace of fixture apps
(octane + reference frameworks) plus a Playwright/Node harness. Every suite can
be run on its own; **`benchmarks/bench.mjs` is the unified runner** that boots the
servers, drives every harness, collects machine-readable results, and enforces
regressions — it is what makes the numbers load-bearing.

Each suite has its own `README.md` describing what it measures and which octane
subsystem a bad number points at. This file documents the **runner and the
result contract**.

## Quick start

```bash
node benchmarks/bench.mjs                       # every suite, normal iterations
node benchmarks/bench.mjs js-framework memo-wall   # only these suites
node benchmarks/bench.mjs --quick js-framework  # reduced-iteration smoke pass
node benchmarks/bench.mjs --list                # list suite names
pnpm bench:all -- --quick                        # same via the root script
```

The runner starts each suite's dev servers (`pnpm --filter <pkg> dev`), waits for
their strict ports, runs the harness with `BENCH_JSON` pointed at a temp file,
then kills the servers **by port** (`lsof -ti tcp:<port>`). Suites run
**sequentially** so ports and CPU never contend. Collected results land in
`benchmarks/results/<suite>.json` (gitignored), one file per suite.

Three suites need no servers: **news** vite-builds and times each target itself
(the runner loops its per-target invocations and merges them), and
**ssr-throughput** and **streaming-ssr** are Node-only.

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
  the *same machine in the same run*, so they are hardware-independent and safe
  on shared runners. `.github/workflows/bench.yml` runs
  `node benchmarks/bench.mjs --quick --ratios` on manual dispatch + a weekly
  cron, uploads `benchmarks/results/` as an artifact, and fails on a breach.
- **`--record` / `--compare` are local-only.** The absolute millisecond baselines
  in `baselines/local/*.json` are specific to the machine that recorded them, so
  they are a personal regression aid, not a gate. See
  [`baselines/README.md`](baselines/README.md).

The **compare rule** is noise-aware: an op is a regression only if
`median > 1.15× baseline` **and** `min > 1.10× baseline`; for sub-0.2ms ops it
must also exceed the baseline median by an absolute >0.1ms. Both conditions guard
against timer jitter on fast ops.

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
      "ops": { "run": { "median": 1.6, "min": 1.5, "p95": 1.8, "sd": 0.1, "samples": 8 } },
      "meta": { "…": "correctness counters / bytes go here" } }
  ]
}
```

- Times are **milliseconds**; `p95`/`sd` are optional; ops/sec suites add
  `opsPerSec`. Non-timing extras (payload bytes, render counters, gate status) go
  under a per-target `meta` object.
- On a **correctness-gate failure** the harness still writes the JSON but adds a
  top-level `"failed": "<reason>"` and exits non-zero. The runner surfaces this
  (`harnessExit`) but does **not** treat it as fatal on its own — the ratio /
  compare checks are the gate, so a suite pinned to a known octane bug doesn't
  block CI's ratio enforcement.
- Every harness also accepts an **iterations argv** (`node run.mjs [iter]`, or
  after the target name for news) so the runner can drive reduced smoke passes.
  ssr-throughput is time-budgeted: its knob is a per-config seconds value and
  `--quick` passes the harness's own `--quick`.

The runner keys everything (result files, baselines, ratio guards) by the
**manifest suite name**, not the JSON's internal `suite` field — so the deopt
variants (`dbmon-deopt`, `js-framework-deopt`), which reuse a base harness via a
`TARGETS` pairing and therefore write `suite: "dbmon"` / `"js-framework"`
internally, get their own baseline and guard namespace.

## Suites

| manifest name | dir | servers | notes |
| --- | --- | --- | --- |
| `js-framework` | js-framework | react, octane-tsrx/jsx, ripple | krausest ops incl. `add` |
| `js-framework-reorder` | js-framework | (same 4) | keyed reorder matrix (LIS vs lastPlacedIndex) |
| `dbmon` | dbmon | octane-tsrx/jsx, react, ripple, solid | per-cell update churn |
| `recursive-context` | recursive-context | ripple, octane-tsrx/jsx, react, solid | context fan-out |
| `signal-favoring` | signal-favoring | octane-tsrx/jsx, solid, react, ripple | cascade vs targeted |
| `news` | news | none (builds) | SSR + hydration, per-target |
| `effectful-list` | effectful-list | octane-tsrx/jsx, react, solid, ripple | effect/ref cleanup churn |
| `memo-wall` | memo-wall | octane-tsrx/jsx, react | memo bail + context walk |
| `portal-swarm` | portal-swarm | octane-tsrx, react, solid | portal render/dispatch |
| `ssr-throughput` | ssr-throughput | none (Node-only) | SSR ops/sec, waterfall, deopt, escape |
| `streaming-ssr` | streaming-ssr | none (Node-only) | streaming shell TTFB, stream totals, chunking |
| `dbmon-deopt` | dbmon | octane-tsrx + octane-deopt | tuned vs plain-.ts cliff |
| `js-framework-deopt` | js-framework | octane-tsrx + naive triplet | tuned vs naive-authoring cliff |
| `async-waterfall` | async-waterfall | octane-tsrx, react, solid, ripple | 10-level nested async: `use()` waterfall vs parallel-by-model signals (init + transition update) |
| `codegen-size` | codegen-size | none (Node-only) | compiled-output bytes: fixed corpus through octane/compiler, raw/min/gzip, `compiled` vs `source` |
| `bundle-size` | bundle-size | none (builds) | shipped JS bytes: production build of each js-framework app, normalized minify, raw/gzip/brotli |

The two size suites measure **bytes, not milliseconds** (deterministic —
`median === min`, and ratio guards on them are exact, hardware-independent
numbers). They are the regression gates for
`docs/compiled-output-optimization-plan.md`: `codegen-size` is the seconds-fast
per-commit signal (its corpus is FIXED — editing the corpus list invalidates the
baseline, re-record when you change it), `bundle-size` is the cross-framework
comparison (all targets built with one normalized minify so solid's
`minify:false` dev config and octane's terser passes don't skew the compare).

`bundle-size` splits every build into an `app` chunk (modules under the app's
own src/) and a `framework` chunk (node_modules + the octane workspace runtime
+ virtual helpers) and reports both, plus totals: `app_*` / `fw_*` / `js_*` ×
raw/gzip/brotli. The `app_*` ops are the primary ratchet — in real apps user
code eclipses the framework runtime, so the per-component codegen share is
what must scale; `fw_*` tracks the one-time runtime cost separately.

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

The harness must implement the BENCH_JSON contract above. For a suite that runs
one harness per target (like news), give `runs` multiple entries — their
`targets` arrays are concatenated into one result. Add ratio guards for the new
suite to `baselines/ratios.json` and (optionally) `--record` local baselines.
