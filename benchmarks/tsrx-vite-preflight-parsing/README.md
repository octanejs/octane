# TSRX Vite preflight parsing

This Node-only suite measures the parse-only classification work performed by
the real Octane Vite transform around authoritative `.tsrx` compilation. It
generates the same small and large component modules for production client and
server transforms, with deterministic resolution and module metadata supplied
through a Vite-compatible transform context.

The parse-count control runs in a fresh Node process with a benchmark-local ESM
loader. The loader wraps only the `parseModule` exports of `@tsrx/core` (adapter
preflight) and `oxc-tsrx/tsrx-core-compat` (authoritative compilation), and
counts only calls whose source and raw/canonical IDs exactly match the generated
root. Recursive dependency analysis therefore cannot inflate the root count.
The expected valid-source totals are:

| Transform | Adapter parses | Authoritative parses | Total |
| --- | ---: | ---: | ---: |
| production client | 1 | 1 | 2 |
| production server | 1 | 1 | 2 |
| development client | 1 | 1 | 2 |
| production client with CSS-module preflight | 1 | 1 | 2 |
| parser disagreement, development client | 2 | 1 | 3 |
| parser disagreement, production server | 2 | 1 | 3 |

Every integrated timing sample checks emitted code, source map, Vite metadata,
watch dependencies, and raw-source classification checksums against
`semantic-manifest.json`. The isolated
control runs the descriptor-import and descriptor-export classifiers either on
the source string twice or on one explicitly shared `@tsrx/core` AST, requiring
identical classification checksums before publishing timings.

```bash
node benchmarks/bench.mjs --quick --ratios tsrx-vite-preflight-parsing
node benchmarks/bench.mjs --record --ratios tsrx-vite-preflight-parsing
```

## Accepted result

The untouched `origin/main` run and the final seven-sample run used the same
generated sources, harness, dependency tree, and machine. Values below are the
suite's reported timing scores in milliseconds; lower is better.

| Target | Untouched | Final | Change | Final score RME |
| --- | ---: | ---: | ---: | ---: |
| 8-component production client | 3.503 | 2.837 | -19.0% | 7.0% |
| 256-component production client | 331.244 | 146.315 | -55.8% | 5.0% |
| 8-component production server | 2.709 | 1.787 | -34.0% | 6.6% |
| 256-component production server | 305.424 | 117.916 | -61.4% | 3.2% |
| 256-component reparsed classification | 216.844 | 209.627 | -3.3% | 2.0% |
| 256-component shared-AST classification | 107.781 | 105.083 | -2.5% | 0.9% |

The valid-source adapter/authoritative/total parse matrix changed from `3/1/4`,
`3/1/4`, `2/1/3`, and `4/1/5` to `1/1/2` in all four modes. Parser disagreement
now stops after one failed adapter preflight plus the compiler-owned descriptor
fallback, for `2/1/3` in development client and production server transforms.
The final isolated ratio is
`105.083 / 209.627 = 0.5013`, below the committed `0.65` ceiling. Both isolated
targets must publish classification checksum
`ce336f36e31d0df9ab509e0e526bf8e588bbb732a507b2fff6990d04b99dd607`
before the ratio is accepted.

Every integrated sample requires the same classification, dependency, source
map, Vite metadata, and output checksums before it publishes a timing. The
committed local baseline records those checksums and the complete sample
statistics. The 8-component client control is intentionally treated as noisy:
one intermediate run reported 4.228 ms, a direct rerun reported 3.176 ms, and
the accepted and final runs reported 3.109 ms and 2.861 ms. The 256-component
client and server improvements remained decisive across those runs. Per-target
variance from the untouched run was not retained, so it is not reconstructed
here.

The wall-clock targets and local baseline are machine-specific evidence, not
portable budgets. CI enforces only the same-run, checksum-backed classification
ratio. The suite counts but does not time development-client and CSS-module
transforms; it does not measure long-lived watch/HMR rebuilds, recursive module
graphs, invalid-source diagnostic latency, alternate compiler-parser choices,
or retained-memory peaks. Invalid-source ownership and transform isolation are
protected by the compiler tests rather than inferred from these timings. The
compiler's authoritative parse remains intentionally separate, so this change
removes redundant adapter work without claiming to eliminate all parsing.
