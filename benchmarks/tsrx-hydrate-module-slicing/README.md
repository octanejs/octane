# TSRX hydrate module slicing

Measure the production hydrate-boundary compiler when one module contains many sibling split points and same-module declarations:

- `focused-movable-*` calls hydrate preparation with an already parsed AST. This isolates boundary/declaration selection at 150 and 2,400 sibling boundaries.
- `focused-retained-high` keeps declarations public while exercising the same preparation layer, providing a path-local control that bypasses module slicing.
- `pipeline-movable-*` compiles the same sources through the production client compiler.
- `pipeline-retained-high` keeps the 2,400 declarations as public exports. It preserves parsing, boundary discovery, and split-module generation without moving declarations into child modules, so candidate-only parser or printer drift cannot masquerade as a slicing win.

Before timing, the runner compiles the public root, representative queried children, and server output. It verifies diagnostics, every dynamic request, declaration placement, server completeness, and stable output checksums. Timed target order reverses on alternating iterations. The primary metric is process CPU milliseconds, which measures compiler work without charging a target for unrelated scheduler contention; wall time remains in the JSON as a diagnostic.

```bash
node benchmarks/tsrx-hydrate-module-slicing/run.mjs 7
node benchmarks/tsrx-hydrate-module-slicing/compare.mjs \
  /path/to/baseline /path/to/candidate 7
node benchmarks/bench.mjs --quick --ratios tsrx-hydrate-module-slicing
```

The cross-checkout comparator uses conservative 95% timing bounds. It requires at least a 1.5x and 200 ms focused improvement with no focused retained-control regression above 5%. Whole-pipeline timings remain visible as a fixed-cost diagnostic rather than diluting the slicing phase behind parsing and code generation. The comparator also requires byte-identical client and server output metadata and rejects identical compiler sources.
