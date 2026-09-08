# Large controlled forms

This benchmark drives the same production-built, 512-field controlled form in
Octane, React, Preact, Solid 2, Svelte, Vue Vapor, and Inferno with real
Playwright mouse and keyboard input.

Correctness checks preserve the original input, focus, caret, typed value, and
rendered output. They also exercise checkbox, radio, select, conditional
sections, complete form submission, reset, and generation-guarded asynchronous
validation. Stale validation results must never overwrite the latest value.
Field-render counts are reported for comparison without assuming that different
renderers must use the same update strategy.

```bash
node benchmarks/bench.mjs --quick controlled-form
node benchmarks/bench.mjs controlled-form
```
