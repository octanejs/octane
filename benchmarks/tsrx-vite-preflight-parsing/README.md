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
| production client | 3 | 1 | 4 |
| production server | 3 | 1 | 4 |
| development client | 2 | 1 | 3 |
| production client with CSS-module preflight | 4 | 1 | 5 |

Every integrated timing sample checks emitted code, source map, Vite metadata,
watch dependencies, and raw-source classification checksums. The isolated
control runs the descriptor-import and descriptor-export classifiers either on
the source string twice or on one explicitly shared `@tsrx/core` AST, requiring
identical classification checksums before publishing timings.

```bash
node benchmarks/bench.mjs --quick tsrx-vite-preflight-parsing
node benchmarks/bench.mjs tsrx-vite-preflight-parsing
```

The wall-clock targets are local evidence, not portable budgets. A same-run
shared-AST/reparsed ratio guard is added only after the production optimization
is accepted. This suite does not replace the compiler's authoritative parser or
exercise invalid-source diagnostic ownership.
