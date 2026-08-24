# Suspense retry coordination: performance evidence

Baseline: `9b06e47ff702b2ab3ff5ad32feb1ea8ce9ebb8e0`. The baseline runtime and compiler were archived from that commit. Both revisions use the same installed dependencies, benchmark fixtures, and runners. The final fallback-routing and deferred error-reporting candidate was rebuilt and remeasured, including fresh SSR timings.

Measured candidate SHA-256:

- `runtime.ts`: `704d023c6d47728817fd590a54c83a8f60f2de7ea6bdf8ce4726cd44216cc667`
- `runtime.server.ts`: `6fcbfd5ec99e6915b9fb3c9069af7db289696b40c6822c749a68712ce45ed64b`

Environment: macOS arm64, Node 26.4.0, esbuild 0.28.1, Vite 8.1.5, `tsrx-core` 0.1.58. Compilation used the repository's supported browser/WASM parser in both revisions because the configured native parser package was unavailable locally. This validates the selected compiler backend, not a native-parser installation.

## Cost model

- Retry work retains the existing off-screen effect/ref capture, with one timer per affected root and DOM-order sorting of ready boundaries. The extra ancestor lookup is installed only while retry batches exist; ordinary renders do not initialize new per-block fields or allocate retry records.
- Renderer cleanup scheduling, commit markers, and hydration observers use optional cold storage. Nested captures forward work; discard releases abandoned transactions. Hydration scans only its notification path, not every render.
- Raw resource checks run only on render exceptions. SSR reuses request-local suspension/discovery queues without synthetic `use()` slots or hydration seeds. The default infinite transition hold allocates no fallback timeout.
- Fallback suspension forwarding runs only in fallback catch paths. Deferred caught-error reporting reuses the existing boundary-reveal queue and allocates a closure only for a configured root callback whose error fallback is hidden. It adds no ordinary component-render field or check. SSR's obsolete-fallback normalization is also exception-only.

## Measured sizes and allocation controls

| Surface | Minified bytes, before → after | Gzip bytes, before → after | Gzip delta |
| --- | ---: | ---: | ---: |
| `attachBehaviorRoot` | 12,044 → 12,044 | 3,745 → 3,745 | 0 |
| `createRoot` | 122,260 → 123,100 | 39,558 → 39,820 | +262 |
| Root + state | 125,477 → 126,317 | 40,597 → 40,851 | +254 |
| Root + ErrorBoundary | 145,680 → 149,395 | 46,682 → 47,753 | +1,071 |
| Root + Suspense | 145,799 → 149,514 | 46,705 → 47,808 | +1,103 |
| `renderToString` | 32,916 → 33,261 | 11,749 → 11,833 | +84 |
| `prerender` | 35,373 → 35,718 | 12,566 → 12,647 | +81 |
| `renderToPipeableStream` | 44,692 → 45,039 | 15,955 → 16,029 | +74 |
| hook-memo runtime-form bundle | 140,754 → 141,616 | 44,591 → 44,875 | +284 |
| hook-memo inline bundle | 142,421 → 143,283 | 45,160 → 45,417 | +257 |

The behavior-only bundle is byte-identical and still excludes `runtime.ts`. All **993 non-bundle hook-memo metrics** are unchanged, including compiled fixture sizes. Values, callback identities, and observer controls pass; fixture/entry/observer/runner hashes match. The inline declaration dependency-hit case still creates zero function expressions and zero arrays over 32 renders.

All 32 compiler source files are byte-identical between revisions. The latest SSR cold-path change is absent from the retained public-export probes but adds 50 bytes to the preceding candidate's compiled SSR application bundle; that application was rebuilt for the timings below.

## Deterministic controls

Use the existing [hook-memo runner](../../../benchmarks/hook-memo/run.mjs) against each source root:

```sh
OCTANE_MEMO_ROOT="$OCTANE_BENCH_SOURCE_ROOT" \
OCTANE_MEMO_EXTERNAL_ROOT="$OCTANE_BENCH_CANDIDATE_ROOT" \
BENCH_JSON="$OCTANE_BENCH_RESULT_JSON" \
node --import /private/tmp/octane-819-browser-parser.mjs benchmarks/hook-memo/run.mjs
```

These are **source-creation events**, not V8 heap allocations or wall-clock timings.

Client export-surface probes use esbuild with `bundle`, `treeShaking`, and `minify` enabled, ESM/browser/ESNext output, `NODE_ENV="production"`, and gzip level 9. Surfaces are `attachBehaviorRoot`; `createRoot`; `createRoot, createElement, useState`; `createRoot, createElement, ErrorBoundary`; and `createRoot, createElement, use, Suspense`. These are retained export surfaces, not representative application bundles.

Server probes use the same build/compression flags with `platform: "neutral"` and `conditions: ["import"]`, exporting `renderToString`, `prerender`, or `renderToPipeableStream` from their authored entry points.

## SSR timing results

Use the existing [SSR-throughput runner and fixtures](../../../benchmarks/ssr-throughput/README.md), with only the selected revision's server/static entry aliases and the supported compiler backend changed during the production build. The benchmark runner itself is unchanged.

```sh
CONFIGS=deopt-page,waterfall-d1 BENCH_JSON="$OCTANE_BENCH_RESULT_JSON" \
node "$OCTANE_BENCH_BUILT_REVISION/run.mjs" 0.5 --no-build
```

After test/build workers finished, ran `baseline-1 → candidate-1 → baseline-2 → candidate-2`. Each run timed each workload for 0.5 s and sampled 250 additional renders for memory.

| Workload | Baseline runner scores (ms) | Candidate runner scores (ms) | Timed samples/run |
| --- | ---: | ---: | ---: |
| `waterfall-d1` | 0.04306 / 0.04328 | 0.04383 / 0.04275 | 11,425–11,664 |
| Compiled `.tsrx` page | 1.7659 / 1.8509 | 1.8779 / 1.8259 | 257–280 |
| Plain-TS descriptor page | 3.6795 / 3.6301 | 3.8116 / 3.7851 | 131–137 |

Because the short descriptor samples consistently favored the baseline, ran one longer, reversed-order pair, `candidate-3 → baseline-3`, at 2 s per workload and 1,000 additional memory renders:

| Workload | Baseline score (ms) | Candidate score (ms) | Timed samples/run |
| --- | ---: | ---: | ---: |
| `waterfall-d1` | 0.04150 | 0.04311 | 46,255–46,906 |
| Compiled `.tsrx` page | 1.7939 | 1.8490 | 1,103–1,114 |
| Plain-TS descriptor page | 3.6426 | 3.5085 | 544–574 |

All existing content gates passed. Every run had the same output byte counts/marker pairs: waterfall 30,854/5, compiled page 134,189/901, descriptor page 148,003/1,802. The waterfall used two Suspense passes throughout.

The descriptor difference changed sign in the longer pair. The longer compiled-page and waterfall samples still favored the baseline by about 3% and 4%. These limited desktop samples neither establish a speedup nor rule out small regressions. No results were dropped.

Memory windows did not force GC. For example, the candidate's short compiled-page heap deltas were −23.5 MiB and +8.9 MiB; the longer descriptor window grew +48.3 MiB in the candidate versus +16.6 MiB in the baseline, with +34–35 MiB RSS in both. These observations do not establish retained-memory parity. Full scores, tail latencies, sample counts, and memory deltas remain in the JSON. These workloads do not measure large retry batches or browser hydration throughput.

## Local raw evidence

The investigation retains full JSON and reproduction helpers under `/private/tmp`:

- `octane-819-hook-memo-{latestbase,fallback-candidate}.json`
- `octane-819-runtime-{latestbase,fallback-candidate}.json` and `octane-819-runtime-probe.mjs`
- `octane-819-error-bundle-probe.{mjs,json}`
- `octane-819-ssr-bundles-{latestbase,fallback-candidate}.json` and `octane-819-ssr-bundle-probe.mjs`
- `octane-819-ssr-fallback-perf/{baseline,candidate}/provenance.json`, built application bundles, and all six per-run JSON
- `octane-819-build-ssr-fallback-perf.mjs`, preserving the original benchmark runner and fixture files
- `octane-819-fallback-performance-comparison.{mjs,json}`, verifying source hashes, compiler equality, hook metrics, and content gates

The archived baseline is `/private/tmp/octane-819-latestbase-bm1dg3`. Native dependency installation was not bypassed to obtain these measurements.
