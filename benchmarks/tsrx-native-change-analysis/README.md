# TSRX native-change analysis

This Node-only suite measures the authored native-`onChange` diagnostic pass and
full development client/server compilation for host trees containing 500 and
4,000 non-text-entry sites.

The large paired control has exactly the same source byte length and parses to
the same AST shape as the hostless target after normalizing its ignored JSX
comment text. That comment contains the conservative `<input` marker, forcing
native-change analysis without changing compiler output. Every timing sample
requires empty diagnostics and classifications; target/control client and
server output digests must also match.

```bash
node benchmarks/bench.mjs --quick --ratios tsrx-native-change-analysis
node benchmarks/tsrx-native-change-analysis/run.mjs 7
```
