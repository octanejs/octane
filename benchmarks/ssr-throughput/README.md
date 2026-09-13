# ssr-throughput bench — Node-only SSR ops/sec

A server-side sibling to [`news`](../news/): where news measures one warm SSR
render + browser hydration, **this suite measures sustained SSR throughput** —
ops/sec, p50/p95/p99 latency, and memory growth under load — entirely in Node.
No Playwright, no ports, no browser; timing is hand-rolled
`process.hrtime.bigint()` loops over production `vite build` SSR bundles.

The subsystem under test is `packages/octane/src/runtime.server.ts` end to end:
the compiled string-concatenation fast path, the interpretive descriptor path
(`ssrChild` / `ssrHostElement` / `ssrSpread` / `ssrDeoptBlockChildren`),
`escapeHtml`, and `render()`'s suspense retry loop.

## Layout

```
benchmarks/ssr-throughput/
├── fixtures/       # octane-only SSR fixtures (waterfall / deopt-page / escape-heavy)
│   └── src/        # .tsrx + plain-.ts twins + deterministic seeded data modules
├── run.mjs         # builds bundles into dist/, times them, prints tables + BENCH_JSON
├── payload.mjs     # production HTML, compression, marker, and stream-carrier audit
├── package.json    # harness deps (vite + externalized framework runtimes)
└── README.md
```

## Part 1 — news-page throughput (Octane and reference frameworks)

Reuses the news app fixtures and build methodology verbatim: `news/gen.mjs` is
invoked as a child process at 50 and then 500 cards, each target's SSR bundle
(`octane-tsrx` `render()` from `octane/server`, React and Preact
`renderToString`, Solid `@solidjs/web` `renderToString`, Svelte's buffered
`svelte/server` `render`, Ripple
`ripple/server` `render` — bundled in by its app's `ssr.noExternal`, so the
built entry is self-contained — and vue-vapor `vue/server-renderer`
`renderToString` — on the server a vapor SFC compiles to
the regular `ssrRender` string codegen, so this measures Vue's standard
compiled SSR — plus Inferno's native `renderToString`) is `vite build`-t with
an outDir override into `dist/news-{50,500}/<target>` here — **nothing under
`benchmarks/news/` is modified** (its `src/data.js` is regenerated back to the
tracked count-50 dataset afterwards; the generator is seeded, so the bytes are
identical). Each config loops the built `renderApp()` for the time budget and
materializes the returned body with `Buffer.byteLength`. That charges every
renderer for flattening/sizing its string as a real response writer must,
instead of letting lazy rope construction move work outside the timer.

A bad octane number here (relative to react/solid, or a regression vs an older
run) points at the compiled `ssr*` helper emission or at `render()`'s per-pass
setup cost — not at any specific feature, which is what Part 2 isolates.

Part 2 remains Octane-only because its waterfall/deopt/escape cases test
Octane-specific server paths.

## Part 2 — octane-only fixtures

- **`waterfall-d{1,2,4}`** — a ~1000-node page with D *sequentially-dependent*
  `use(thenable)` `@try` boundaries (each thenable resolves on a microtask and
  is derived from the previous level's resolved value). `render()`'s suspense
  loop (`MAX_SUSPENSE_PASSES`) re-renders the FULL tree once per pass, so depth
  D costs D+1 passes; the harness prints the d2/d1 and d4/d1 scaling (ideal
  1.5x / 2.5x). A super-linear slope points at per-pass overhead in the retry
  loop (pass state setup, the `OCC`/`RESOLVED` maps), not at serialization.
  Octane-only: React/Solid stream/async SSR APIs are shaped differently enough
  that a ratio would compare APIs, not implementations.
- **`waterfall-d4-x32`** — the same fixture with 32 concurrent `render()` calls
  racing (one sample = one `Promise.all` batch). Because every pass saves and
  restores the module-global ambient state around its awaits, interleaved
  renders must not corrupt each other — the gate asserts all 32 bodies are
  byte-identical to a serial render. The "batch overhead per render" line shows
  what concurrency costs beyond 32× serial.
- **`deopt-page/{octane-fast,octane-deopt}`** — the SAME 300-card page authored
  twice: compiled `.tsrx` (static chunks + `ssrSpread`/`ssrAttr`/`ssrText`) vs
  plain-`.ts` `createElement` descriptor trees (the shape every `@octanejs`
  binding produces → `ssrChild`/`ssrHostElement`/`ssrDeoptBlockChildren`).
  Correctness gate: both bodies byte-identical after stripping HTML comments
  (hydration markers legitimately differ). **The headline number is the
  plain/compiled ratio** — the SSR authoring cliff a binding-heavy page pays.
  An untimed observer of the clean production bundle also limits server HTML
  factory calls to 601 (the page plus 300 cards and 300 avatars); the descriptor
  twin must make none. Private loop bodies should concatenate serialized strings
  without creating additional carriers.
- **`escape-heavy`** — 10k text holes whose every value contains `&<>"'`.
  Isolates `escapeHtml`. After timing and memory measurement, a deterministic
  work gate renders the fixture again, checks that its complete response is
  unchanged, and rejects regular-expression escaping passes. It also reports
  the number and size of eager list snapshots without changing their semantics.
  Production profiling attributed about 0.64% of sampled allocated bytes to
  the list snapshot; its independently measured cost was about 0.025% of
  render time. Preserving that snapshot protects custom iterators, observable
  getters, and render-time mutations.
  Its 10,000-item loop has a server HTML factory-call budget of one for the public
  root component. Factory observers run after all timing and memory phases and
  require complete body/CSS equality with the clean bundle. These count source
  factory calls, not V8 heap allocations or allocated bytes.

## Running

```bash
# from benchmarks/ssr-throughput (after pnpm install at the repo root):
pnpm bench                 # ~10s timed loop per config + ≤5k-render memory phase
node run.mjs 2             # smoke: 2s per config, 1k-render memory phase
node run.mjs 10 --no-build # reuse existing dist/ bundles
CONFIGS=waterfall,escape node run.mjs 5   # substring-filter configs
BENCH_JSON=/tmp/ssr.json node run.mjs     # also write machine-readable results
```

The `[seconds]` argv is this suite's iterations knob (the loop is
time-budgeted; per-op sample counts are reported). `BENCH_JSON` follows the
shared contract: ms stats under `ops.render` (plus `opsPerSec`), payload
bytes / marker counts / memory growth under `meta`, a top-level `failed` on any
gate failure (and a non-zero exit).

### Positional descriptor identity work gate (opt-in)

`unkeyed-work.mjs` builds only its separate production SSR fixture entry under
ignored `dist/unkeyed-work/`; the standard throughput fixtures and scores are
untouched. Its 1,000 unkeyed component descriptors exercise the top-level
server child-list identity path. One adjacent explicitly keyed child with key
`"0"` checks that the two key namespaces stay distinct. The gate verifies row
order, complete HTML/CSS equality, and an untimed count of positional key
serialization before reporting warmed render timings. Compare the same output
hash across a baseline and candidate build:

```bash
EXPECT_IMPLICIT_JSON=1000 node benchmarks/ssr-throughput/unkeyed-work.mjs 2
EXPECTED_HTML_SHA=YOUR_BASELINE_SHA node benchmarks/ssr-throughput/unkeyed-work.mjs 2
```

Timing deltas within process-to-process variance are inconclusive; the
serialization count is the deterministic work gate.

### Nested descriptor identity work gate (opt-in)

`nested-work.mjs` builds a separate minified production SSR entry into ignored
`dist/nested-work-{label}/`. It renders 1,000 implicit component children and an
adjacent explicit key `"0"` under one nested array. A flat list and a fully
explicit nested list provide controls. Descriptors are prepared before rendering
so the timed operation measures their traversal and serialization.

The observer runs in its own process and installs its `JSON.stringify` wrapper
before importing the built runtime. A second process imports the same artifact
without the observer, checks complete HTML/CSS hashes and row order, then times
rendering with 350 ms warmup per mode. Every timed render materializes its HTML
with `Buffer.byteLength`. Reported calls describe serialization work, not V8
allocation counts.

At the baseline revision, freeze and measure its bundle:

```bash
NESTED_BUILD_LABEL=baseline node benchmarks/ssr-throughput/nested-work.mjs 0 --build-only
NESTED_BUILD_LABEL=baseline EXPECT_NESTED_IMPLICIT_JSON=1000 EXPECT_NESTED_PATH_JSON=0 BENCH_JSON=/tmp/ssr-nested-baseline.json node benchmarks/ssr-throughput/nested-work.mjs 2 --no-build
```

After changing the runtime, preserve a separate candidate bundle. Set
`EXPECTED_RESPONSE_SHA` to the baseline's `responseSha`; it combines the complete
HTML and CSS hashes for all three modes:

```bash
NESTED_BUILD_LABEL=candidate node benchmarks/ssr-throughput/nested-work.mjs 0 --build-only
NESTED_BUILD_LABEL=candidate EXPECTED_RESPONSE_SHA=YOUR_BASELINE_SHA BENCH_JSON=/tmp/ssr-nested-candidate.json node benchmarks/ssr-throughput/nested-work.mjs 2 --no-build
```

The candidate gate requires zero full nested implicit key serializations and
one shared path serialization, while flat and fully explicit controls require
zero shared paths. Zero seconds performs only semantic/work checks. Keep the
built artifacts fixed and repeat the identical `--no-build` commands in
A–B–B–A order to compare timing distributions. Output includes Node version,
artifact SHA, raw/gzip bundle bytes, per-mode work counts, HTML/CSS hashes, and
median/p95 render latency. The existing `unkeyed-work.mjs` gate is unchanged.

#### Nested prefix reuse — 2026-09-10

Compared merged main `afdc3618a` with nested implicit prefix reuse on Node
26.4.0 / Darwin 25.6.0 / Apple M5 Max (arm64). Frozen minified production
artifacts ran in A–B–B–A–A–B–B–A order, four fresh processes per variant, with
350 ms warmup and two seconds of timing per mode. Values are the median and
range of the four per-process medians:

| Mode | Main ms, median [range] | Candidate ms, median [range] | JSON work, main → candidate |
| --- | --- | --- | --- |
| Nested implicit siblings | 2.168 [1.984–3.665] | 2.033 [1.982–2.132] | 1,000 full implicit keys → one shared path |
| Flat siblings | 1.881 [1.744–3.266] | 1.843 [1.803–1.867] | Zero implicit/path serializations in both |
| Fully explicit nested siblings | 2.184 [2.112–2.345] | 2.156 [2.112–2.180] | 1,001 explicit keys; zero shared paths in both |

Every mode preserves all 1,001 rows and byte-identical HTML/CSS. The combined
response checksum is `a88626f3f1917242e578e43611410e6aa8f542365572844f68286f72d8e10534`.
The minified fixture bundle grows from 58,519 to 59,043 raw bytes and 20,021 to
20,198 gzip bytes (+524 / +177). These are complete fixture bundle sizes.

An initial version routed flat leaves through the larger helper and showed a
17.1% median flat-list slowdown with separated ranges. Keeping the original
small key helper for flat and singleton containers removed that separation in
the final comparison above. One baseline process was slow across nested and
flat modes; it remains included in the reported ranges. Final distributions
overlap, so these runs establish reduced serialization work without a
throughput claim. The final candidate artifact checksum is
`de43e3e23ae90e3033249b19ef1dd8272ae5d56a05941624183bcb676910cf91`.

### Private loop HTML carriers — 2026-09-03

Compared merged main `44d50dbc0` with private loop bodies returning serialized
strings directly, on Node 26.4.0 / macOS Darwin 25.6.0 / Apple M5 Max (arm64).
Both clean production fixture bundles were preserved before measurement. The
same runner loaded each bundle in a fresh process, in A-B-B-A-A-B-B-A order:
four runs per variant, 0.2 seconds warmup, 2 seconds timing per fixture, and
1,000 memory-phase renders. Values below are the median and range of the four
run scores (each score is the shared harness's steady-window mean).

| Fixture | Main ms, median [range] | Candidate ms, median [range] | HTML factory calls, main → candidate |
| --- | --- | --- | --- |
| 300 compiled cards | 1.871 [1.868–1.917] | 1.891 [1.821–1.931] | 1,801 → 601 |
| Descriptor twin (control) | 3.814 [3.776–3.901] | 3.902 [3.803–4.080] | 0 → 0 |
| 10,000 escaped text holes | 3.318 [3.277–3.382] | 3.338 [3.270–3.539] | 10,001 → 1 |

The timing ranges overlap and paired directions vary, including the unchanged
descriptor control: these runs establish no throughput improvement or
regression. The deterministic result is fewer factory calls, not a measurement
of actual heap allocations. The unminified fixture bundle shrank from 176,179
to 176,125 bytes. Complete body/CSS output was byte-identical across both
versions for all three fixtures and the hydratable/static control-flow pages;
every observed copy also matched its clean bundle. Main failed only the two
new factory-call budgets, while the candidate passed them.

To reproduce, build and preserve each revision's fixture bundle with the same
installed dependencies, restore each clean bundle to this suite's
`dist/fixtures/`, and run the current harness in the order above. Both commands
below run from the repository root (which also keeps emitted path comments
consistent for the byte comparison):

```bash
pnpm exec vite build benchmarks/ssr-throughput/fixtures --ssr src/entry-server.ts --outDir ../dist/fixtures --emptyOutDir
CONFIGS=deopt-page,escape-heavy BENCH_JSON=/tmp/ssr-sample.json node benchmarks/ssr-throughput/run.mjs 2 --no-build
```

### Escape pre-scan split by length — 2026-09-12

Compared main `58da3448b` against a candidate that makes `escapeHtml`'s
no-escape guard length-keyed — a stateless non-global `/[&<>]/` test under 32
chars, three `indexOf` scans at or above — and drops the `/g`+`lastIndex`
bookkeeping from `escapeAttr`. Node 22 / macOS / Apple Silicon. A CPU profile
of the baseline news-500 loop showed the global-regexp guard scan at ~30% of
render time. Baseline and candidate each ran three fresh processes of the same
command (fixture bundles rebuilt per revision, then `--no-build`):

```bash
CONFIGS=news-500/octane-tsrx,news-50/octane-tsrx,waterfall-d1 \
  node benchmarks/ssr-throughput/run.mjs 8
```

| Config | Baseline score ms, runs | Candidate score ms, runs | Delta |
| --- | --- | --- | --- |
| news-500/octane-tsrx | 0.552 / 0.544 / 0.531 | 0.427 / 0.435 / 0.512 | −20% on median (0.435 vs 0.544) |
| news-50/octane-tsrx | 0.045 / 0.048 / 0.047 | 0.038 / 0.041 / 0.041 | −14% |
| waterfall-d1 (control) | 0.070 / 0.071 / 0.066 | 0.072 / 0.070 / 0.081 | inside spread |

Body bytes and marker counts were identical across every run (41 KB/2,
409 KB/2, 30 KB/5). waterfall-d1 re-serializes a ~1,000-node page per Suspense
pass and is the noisiest config in this suite — same-binary repeats spanned
0.066–0.122 across the session, so its small residual elevation is noise, not
a measured regression; the mechanism there is strictly less work than the old
`/g` scan (its strings are all under 32 chars and take the non-global regexp).

An intermediate version used three `indexOf` scans at all lengths: it kept the
news-500 win but measurably regressed waterfall-d1 (~+13%), because three
builtin calls cost more than one regexp entry on tiny strings. The measured
crossover sits at ~32 chars, which is what the length split encodes.

## Production HTML payload audit

`pnpm --dir benchmarks/ssr-throughput bench:payload` builds only the Octane and
React fixtures needed to compare four production response shapes:

- the same 50-card news page through Octane TSRX, Octane JSX, and React;
- the same 300-card component-heavy page through compiled TSRX and generic
  `createElement` descriptors, with its identical comment-free markup as a
  control;
- 300 fully specified host-only `@if` and `@switch` branches, compared with
  their byte-identical non-hydratable visible markup; and
- the same 10-boundary streaming Suspense page through Octane and React.

Each response reports its raw, gzip, and Brotli size, hydration-comment count
and bytes, script bytes, and the number, size, and JSON-encoding expansion of
Octane's streamed segment carriers. The audit first proves byte-identical
visible HTML for the buffered scenarios and applies the shared streaming
correctness gate before reporting wire size.

Run `node benchmarks/ssr-throughput/payload.mjs --no-build` to reuse the
previous production outputs, or set `BENCH_JSON=/tmp/ssr-payload.json` to save
the full compressed-size and marker-category breakdown.

## Caveats / bias notes

- **Memory growth is not a leak detector.** Deltas are raw
  `process.memoryUsage()` over up to 5k renders with NO forced GC, so they
  measure allocator behavior under sustained load; small negatives (a GC
  landed) are normal. The phase is additionally time-capped (~60s) for slow
  configs — `meta.memRenders` records the real count.
- **`hydrationMarkerPairs` counts `<!--[` occurrences** — octane's marker
  protocol. It is reported for react/solid too (where it is ~0) purely so the
  octane payload overhead is visible next to their body bytes.
- **This package declares the externalized reference runtimes** even though it
  authors no code in those frameworks: Node resolves the built news bundles'
  imports from `dist/…` upward — i.e. from this package's `node_modules`.
  Versions come from the same catalog as the news fixtures.
- Sub-millisecond configs (waterfall d1) rely on per-call `hrtime.bigint()`
  sampling; timer overhead (~0.1µs) is negligible at that scale, so no
  inner-loop division is needed.
- **If a run is killed mid-build** (SIGKILL — a thrown error is already
  handled), `benchmarks/news/*/src/data.js` may be left at count 500; run
  `node ../news/gen.mjs 50` to restore the tracked dataset.
