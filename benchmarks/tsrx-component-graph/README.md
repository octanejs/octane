# TSrX component graph compilation

This Node-only suite compiles matched production TSrX graphs in two declaration
orders. The original 2,400-component variants remain intact. Every component
wraps the next component. One graph's leaf reads a live import, so the compiler
must carry that import witness through all 2,399 same-module call edges so
automatic memoization cannot hide a later live binding update. The other
graph's leaf renders an imported component, so all 2,400 same-module components
must retain a fetch-tree warm plan.

The durable anchorless-safety pair contains 9,600-component chains. Every
nonterminal component has an exhaustive component-or-host root. The terminal
has a missing `@else`, so it is the single locally unsafe root and all of its
same-module dependents must also keep positional anchors. In
`anchorless-dependent-first-*`, the chain root is declared before its
dependencies: the former whole-map safety fixed point could invalidate only one
additional dependent per pass. `anchorless-dependency-first-*` declares the
unsafe leaf first, so that scan invalidated the complete chain in one pass. Both
orders compile with `autoMemo: false`, emit zero warm plans, classify only the
unrelated plain-host tail and exported app as single-root, and emit the same two
required anchors in the app's all-component-children host.

The accepted eight-iteration characterization against pinned main
`9779569e46f02e28c73d0a8ed74065931a2fd7fa` is retained here rather than keeping
the lower sizes as permanent timed targets:

| Components | Dependent-first score | Dependency-first score | Score ratio | Penalty | Robust 95% ratio | Robust 95% penalty |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2,400 | 692.223 ms | 541.578 ms | 1.278x | 150.645 ms | 1.010x | 5.925 ms |
| 4,800 | 1,643.181 ms | 1,063.515 ms | 1.545x | 579.666 ms | 1.217x | 253.040 ms |
| 9,600 | 4,541.318 ms | 2,131.667 ms | 2.130x | 2,409.650 ms | 1.948x | 2,062.224 ms |

The final candidate was ratified with a paired process comparison. The
eight-iteration attempt passed the 10% combined-score RME ceiling, so the
permitted retry was not needed. The comparator scored the arithmetic mean of
all samples from both balanced process positions for each checkout (16 raw
samples per checkout and declaration order):

| Checkout | Order | Score | Score RME | Conservative 95% score bounds | Minimum |
| --- | --- | ---: | ---: | ---: | ---: |
| pinned main | dependent-first | 4,416.381 ms | 7.610% | 4,080.294–4,752.469 ms | 3,698.488 ms |
| pinned main | dependency-first | 2,046.282 ms | 1.813% | 2,009.182–2,083.383 ms | 1,928.451 ms |
| candidate | dependent-first | 2,002.861 ms | 2.050% | 1,961.798–2,043.924 ms | 1,901.701 ms |
| candidate | dependency-first | 2,050.881 ms | 2.443% | 2,000.771–2,100.990 ms | 1,926.741 ms |

The candidate declaration-order ratio was `0.976586`, below the frozen `1.25`
ceiling. The headline root-first score improvement was 2,413.520 ms. The conservative
bound was 2,036.370 ms (`main lower bound - candidate upper bound`), above the
25 ms floor. Dependency-first candidate/main score and minimum ratios were
`1.002247` and `0.999113`; neither exceeded its 1.15 or 1.10 limit, so the
existing benchmark-runner non-regression predicate passed.

The comparator spawns fresh runner processes in
main-candidate-candidate-main order and emits the raw samples, shared-statistics
aggregates, formulas, gate results, and pass/fail/inconclusive status as JSON.
The aggregate verdict includes every sample from both process positions. The
reference checkout must be clean and exactly match the required full commit
SHA; both checkout states are recorded in the result.
Any combined representative `scoreRme` above 10% causes the whole process order
to rerun once at 16 iterations; persistent noise exits 2 rather than changing a
threshold.

```bash
node benchmarks/tsrx-component-graph/compare.mjs \
  --reference-root=/private/tmp/octane-tsrx-main.5AWJdo \
  --reference-revision=9779569e46f02e28c73d0a8ed74065931a2fd7fa \
  --candidate-root=. \
  --iterations=8 \
  --max-score-rme=10 \
  --max-order-ratio=1.25 \
  --min-root-improvement-ms=25
```

This is a same-machine compiler-latency claim for the 9,600-component
anchorless-safety pair. It is not a runtime, SSR, hydration, memory, bundle-size,
or general compiler-throughput claim. The deterministic semantic controls and
the two representative output validations run outside every timed sample.

Small untimed controls also require a closed synchronous cycle to emit no warm
plan and a cycle that reaches an opaque component to keep both reachable plans.
Anchorless controls compile through the public compiler path and parse the
resulting module AST. An independent bounded repeated-scan solver supplies the
expected safety vector for chain, branch/fan-in, multiple-seed, safe-cycle,
seeded-cycle, imported/missing, repeated-edge, and ineligible-dependent-boundary
graphs in both declaration orders. A distinct all-component-children probe
observes every local component's lowering. Template values are found by
following the runtime template import binding, so the controls do not pin
helper aliases, temporary names, or generated formatting. All deterministic
validation runs before warmups; retained timing samples contain only `compile`.

`dependent-first` declares the exported root before its dependencies. A graph
analysis should not care about that ordinary function-hoisting choice.
`dependency-first` declares the leaf first and is the same-machine reference.
The live-import variants require zero diagnostics and exactly 2,399 emitted
live-binding witnesses before their samples count. The opaque-leaf variants
require zero diagnostics and exactly 2,400 emitted warm plans. These semantic
checks prevent faster timings obtained by dropping graph propagation work.

The declaration orders also pin the compiler's component-hoisting decision.
`dependent-first` has 2,399 real references above their declarations, while
`dependency-first` has none. The harness verifies both counts so the compiler
can index those references once without changing module-evaluation semantics.

```bash
node benchmarks/bench.mjs --quick --ratios tsrx-component-graph
node benchmarks/bench.mjs tsrx-component-graph
```

The ratio guards allow timing noise but reject whole-module fixed-point rescans,
whose work grows with both component count and dependency depth. The opaque-leaf
pair specifically protects fetch-tree warm reachability from declaration-order
dependent rescans.
The anchorless characterization freezes a 1.25 maximum order ratio at 9,600
components. Its paired comparator separately requires a conservative 25 ms
root-first improvement and reports confidence bounds and score RMEs for both
checkouts and declaration orders.
`OCTANE_GRAPH_ROOT=/path/to/checkout` selects a different compiler checkout for
an A/B run while retaining this exact harness and fixture generator.
