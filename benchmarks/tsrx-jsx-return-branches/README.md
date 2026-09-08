# TSRX conditional JSX return compilation

This Node-only suite compiles modules with 120 and 480 exported components.
Every eligible component selects between two different host roots with ordinary
JavaScript returns. Before a timing sample counts, client and server output must
contain one lowered control block per component, and bundler classification
must report every exported component as void-output.

The same-sized ineligible control uses identical host roots in both branches.
It therefore exercises parsing, branch analysis, and printing without entering
the render-only module-use proof. Its absolute timings make work shifted into a
common compiler path visible.

The ratio guards compare compile time per 100 components at the two eligible
sizes. Repeating a whole-module use scan for each eligible component grows with
both module size and component count; a module-scoped index stays roughly flat
per component.

```bash
node benchmarks/bench.mjs --quick --ratios tsrx-jsx-return-branches
node benchmarks/bench.mjs tsrx-jsx-return-branches
```

`OCTANE_JSX_RETURN_ROOT=/path/to/checkout` selects a different compiler checkout
for an exact-main A/B run while retaining this harness and generated workload.
