# Preliminary public-entry bundle measurement

This measurement compares archived baseline
`ba9abbfb634786a1b081852f6eb51845f3d588fc` with the working candidate source
identified by every input hash in `bundles-preliminary.json`. It ran on Node
26.4.0 with esbuild 0.28.1, Alien Signals 3.2.0, and devalue 5.8.2 from the
explicit isolated tooling installation. All seven bundle-boundary and export
loading checks passed. No measured source changed during the run.

| Public entry | Raw bytes | Gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| Baseline `octane` / `createRoot` | 132,788 | 42,785 | 37,608 |
| Candidate `octane` / `createRoot` | 135,256 | 43,689 | 38,323 |
| Baseline `octane/server` / `renderToString` | 33,167 | 11,853 | 10,736 |
| Candidate `octane/server` / `renderToString` | 38,270 | 13,710 | 12,391 |
| Candidate `octane/signals` / `createScope`, `query` | 28,148 | 9,081 | 8,238 |
| Candidate `octane/signals/client` / `useSignal$` | 29,820 | 9,941 | 8,993 |
| Candidate `octane/signals/server` / `useSignal$` | 28,912 | 9,454 | 8,576 |

The ordinary client entry grew 2,468 raw bytes, 904 gzip bytes (2.11%), and 715
Brotli bytes. The ordinary server entry grew 5,103 raw bytes, 1,857 gzip bytes
(15.67%), and 1,655 Brotli bytes. Neither ordinary entry resolved Alien or the
scoped engine. Protocol and native event handling remain reachable on the
ordinary client path; the server also retains its native collector, seed, and
server-driver code. Isolation of the engine therefore does not mean the
ordinary runtime has zero cost.

These entries export functions without compiling an application. The optional
hook entries are separate absolute costs; subtracting their sizes from an
ordinary entry would not establish the incremental cost in a combined app.
The engine smoke checks a simple write and subscription, and the server smoke
checks an empty render. Neither proves native DOM, hydration, asynchronous
rendering, or application performance. Runtime integration was still changing
after this measurement, so this result is not the final acceptance evidence.

The run used:

```bash
BENCH_JSON=benchmarks/scoped-signals/results/2026-08-27/bundles-preliminary.json node benchmarks/scoped-signals/run-bundles.mjs \
  --baseline-ref=ba9abbfb634786a1b081852f6eb51845f3d588fc \
  --baseline-package=/private/tmp/octane-scoped-bundle-baseline.m8FlzX/packages/octane \
  --tooling-root=/private/tmp/octane-scoped-signals-tooling.n1e5b0
```

The repository-formatted JSON report SHA-256 is
`74b1cae610ac6cf7e665caa3f2d83d184c0d24f4592aae97eb9127050bbc6440`.
`report-format-provenance.json` records its original run hash and the verified
unchanged parsed values after the single formatting pass.
It records runner hash
`704f51dbf297b515de0e731f882e16b72c84ddd20cbbeec6bb699c22c5fc0dc9`, fixture
hash `99f42a2549212d2bc6dfb244351724375ffe2448d9944a0e447a11c132c360fb`, and
baseline archive hash
`fcdf2478d3a4801c6fab91dcf2ef20c222c57e36ff9df4feb312a866f7e63801`.
The baseline package manifest and every bundled baseline source also passed an
exact Git-blob check; the report contains those object IDs and all input hashes.
