# TSRX nesting diagnostics

This Node-only suite compiles development-mode TSRX modules containing 500 and
2,000 distinct invalid HTML nesting sites. Each output is parsed as a module and
must retain its root validation plus one ordered `devHtmlNesting` call per
invalid authored site before its timing sample is accepted.

The ratio guard compares compile time per 1,000 invalid sites at the two sizes.
A linear identity set stays roughly flat per site; rescanning and
serializing the whole warning array for every new site grows with the module.

```bash
node benchmarks/bench.mjs --quick --ratios tsrx-nesting-diagnostics
node benchmarks/bench.mjs tsrx-nesting-diagnostics
```
