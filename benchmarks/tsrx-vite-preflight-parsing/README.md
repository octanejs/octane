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

Every integrated timing sample checks emitted code, source map, Vite metadata,
watch dependencies, and raw-source classification checksums. The isolated
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
| 8-component production client | 3.503 | 2.861 | -18.3% | 7.2% |
| 256-component production client | 331.244 | 149.322 | -54.9% | 7.7% |
| 8-component production server | 2.709 | 1.803 | -33.4% | 7.6% |
| 256-component production server | 305.424 | 119.345 | -60.9% | 3.0% |
| 256-component reparsed classification | 216.844 | 209.872 | -3.2% | 0.6% |
| 256-component shared-AST classification | 107.781 | 105.775 | -1.9% | 1.6% |

The adapter/authoritative/total parse matrix changed from `3/1/4`, `3/1/4`,
`2/1/3`, and `4/1/5` to `1/1/2` in all four modes. The final isolated ratio is
`105.775 / 209.872 = 0.5040`, below the committed `0.65` ceiling. Both isolated
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
