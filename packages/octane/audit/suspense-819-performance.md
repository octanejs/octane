# Suspense retry coordination: performance evidence

Deterministic baseline: `9b06e47ff702b2ab3ff5ad32feb1ea8ce9ebb8e0`. The baseline runtime and compiler were archived from that commit, and the candidate was remeasured after merging it. Both revisions use the same installed dependencies, benchmark fixtures, and runners. The earlier SSR timing provenance is retained explicitly below.

Measured candidate SHA-256:

- `runtime.ts`: `3cc456380e61fa495c1c4175e6b009fcee0e1905b23080d1bac53b13e119359f`
- `runtime.server.ts`: `3d62690e95b9d68a2fc0090bf952759d9b6065ace238cf4007da022879c1b4f8`

Environment: macOS arm64, Node 26.4.0, esbuild 0.28.1, Vite 8.1.5, `tsrx-core` 0.1.58. Compilation used the repository's supported browser/WASM parser in both revisions because the configured native parser package was unavailable locally. This validates the selected compiler backend, not a native-parser installation.

## Cost model

- Retry work retains the existing off-screen effect/ref capture, with one timer per affected root and DOM-order sorting of ready boundaries. The extra ancestor lookup is installed only while retry batches exist; ordinary renders do not initialize new per-block fields or allocate retry records.
- Renderer cleanup scheduling, commit markers, and hydration observers use optional cold storage. Nested captures forward work; discard releases abandoned transactions. Hydration scans only its notification path, not every render.
- Raw resource checks run only on render exceptions. SSR reuses request-local suspension/discovery queues without synthetic `use()` slots or hydration seeds. The default infinite transition hold allocates no fallback timeout.

## Measured sizes and allocation controls

| Surface | Minified bytes, before → after | Gzip bytes, before → after | Gzip delta |
| --- | ---: | ---: | ---: |
| `attachBehaviorRoot` | 12,044 → 12,044 | 3,745 → 3,745 | 0 |
| `createRoot` | 122,260 → 122,844 | 39,558 → 39,752 | +194 |
| Root + state | 125,477 → 126,061 | 40,597 → 40,774 | +177 |
| Root + Suspense | 145,799 → 149,083 | 46,705 → 47,668 | +963 |
| `renderToString` | 32,916 → 33,261 | 11,749 → 11,833 | +84 |
| `prerender` | 35,373 → 35,718 | 12,566 → 12,647 | +81 |
| `renderToPipeableStream` | 44,692 → 45,039 | 15,955 → 16,029 | +74 |
| hook-memo runtime-form bundle | 140,754 → 141,352 | 44,591 → 44,785 | +194 |
| hook-memo inline bundle | 142,421 → 143,019 | 45,160 → 45,347 | +187 |

The behavior-only bundle is byte-identical and still excludes `runtime.ts`. All **993 non-bundle hook-memo metrics** are unchanged, including compiled fixture sizes. Values, callback identities, and observer controls pass; fixture/entry/observer/runner hashes match. The inline declaration dependency-hit case still creates zero function expressions and zero arrays over 32 renders.

The measured client bundles are also byte-identical to the preceding `7e8a1a2` comparison. These export probes do not measure the upstream hydration-text path added by the latest merge.

## Deterministic controls

Use the existing [hook-memo runner](../../../benchmarks/hook-memo/run.mjs) against each source root:

```sh
OCTANE_MEMO_ROOT="$OCTANE_BENCH_SOURCE_ROOT" \
OCTANE_MEMO_EXTERNAL_ROOT="$OCTANE_BENCH_CANDIDATE_ROOT" \
BENCH_JSON="$OCTANE_BENCH_RESULT_JSON" \
node --import /private/tmp/octane-819-browser-parser.mjs benchmarks/hook-memo/run.mjs
```

These are **source-creation events**, not V8 heap allocations or wall-clock timings.

Client export-surface probes use esbuild with `bundle`, `treeShaking`, and `minify` enabled, ESM/browser/ESNext output, `NODE_ENV="production"`, and gzip level 9. Surfaces are `attachBehaviorRoot`; `createRoot`; `createRoot, createElement, useState`; and `createRoot, createElement, use, Suspense`. These are retained export surfaces, not representative application bundles.

Server probes use the same build/compression flags with `platform: "neutral"` and `conditions: ["import"]`, exporting `renderToString`, `prerender`, or `renderToPipeableStream` from their authored entry points.

## SSR timing results

The timing runs below used the earlier baseline `44c4658757be5bbf080535c667806777c226ce5e`. Its server runtime, compiler, and benchmark sources are unchanged at `9b06e47`. Rebuilding after the merge produced a byte-identical candidate SSR bundle; the new baseline differs only in twelve `//#region` temporary-directory comments. Canonicalizing only those comment paths produces identical baseline output hashes. The proof is retained in `octane-819-latestbase-comparison.json`; these remain the original timing runs, not a new wall-clock experiment.

Use the existing [SSR-throughput runner and fixtures](../../../benchmarks/ssr-throughput/README.md), with only the selected revision's server/static entry aliases and the supported compiler backend changed during the production build. The benchmark runner itself is unchanged.

```sh
CONFIGS=deopt-page,waterfall-d1 BENCH_JSON="$OCTANE_BENCH_RESULT_JSON" \
node "$OCTANE_BENCH_BUILT_REVISION/run.mjs" 0.5 --no-build
```

After test/build workers finished, ran `baseline-2 → candidate-1 → baseline-3 → candidate-2`; the earlier `baseline-1` pilot is not included below. Each run timed each workload for 0.5 s and sampled 250 additional renders for memory.

| Workload | Baseline runner scores (ms) | Candidate runner scores (ms) | Timed samples/run |
| --- | ---: | ---: | ---: |
| `waterfall-d1` | 0.0426 / 0.0461 | 0.0438 / 0.0444 | 10,776–11,423 |
| Compiled `.tsrx` page | 1.8371 / 1.9871 | 1.9081 / 1.9655 | 221–265 |
| Plain-TS descriptor page | 3.6252 / 4.1593 | 3.9445 / 3.8619 | 124–134 |

All existing content gates passed. Every run had the same output byte counts/marker pairs: waterfall 30,854/5, compiled page 134,189/901, descriptor page 148,003/1,802. The waterfall used two Suspense passes throughout.

Candidate scores lie within the observed baseline ranges. These short desktop samples do not establish a speedup or rule out small regressions. One candidate waterfall memory sample grew by 26.3 MiB RSS / 15.3 MiB heap; its repeat was +48 KiB RSS / −0.8 MiB heap. The unforced-GC windows do not establish a retained-memory guarantee. Full scores, tail latencies, sample counts, and memory deltas remain in the JSON, including that outlier. These workloads do not measure large retry batches or browser hydration throughput.

## Local raw evidence

The investigation retains full JSON and reproduction helpers under `/private/tmp`:

- `octane-819-hook-memo-{latestbase,latest-candidate}.json`
- `octane-819-runtime-{latestbase,latest-candidate}.json` and `octane-819-runtime-probe.mjs`
- `octane-819-ssr-bundles-{latestbase,latest-candidate}.json` and `octane-819-ssr-bundle-probe.mjs`
- `octane-819-ssr-perf/{baseline,candidate}/provenance.json`, `comparison.json`, and all per-run JSON
- `octane-819-ssr-latestbase-perf/{baseline,candidate}/provenance.json` and `octane-819-latestbase-comparison.json`
- `octane-819-build-ssr-perf.mjs` and `octane-819-build-ssr-latestbase-perf.mjs`, preserving the original benchmark runner and fixture files

The archived deterministic baseline is `/private/tmp/octane-819-latestbase-bm1dg3`; the original timing baseline remains `/private/tmp/octane-819-perf-baseline-roy3kglp`. Native dependency installation was not bypassed to obtain these measurements.
