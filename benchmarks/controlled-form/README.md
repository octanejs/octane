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

The companion radio workload measures native property reads over complete
controlled updates, unchanged updates, requested resets, native click sequences,
and native ViewTransition updates. It uses 128 and 512 radios in two-choice groups, plus
checkbox, unrelated text-field, and one-large-group controls. Each case checks
the same values, surviving host identities, and teardown with and without the
observers; two observed runs must have identical counts. Native getters and
`importNode` always delegate to the browser and are restored before assertions.

```bash
node benchmarks/controlled-form/radio-work.mjs
node benchmarks/controlled-form/radio-work.mjs --octane-revision=<commit-sha>
node benchmarks/bench.mjs --ratios controlled-form
```

`RADIO_CHROME` optionally selects a Chrome executable. `BENCH_JSON` writes the
normal benchmark payload. Two committed guards bound 512/128 growth to 5×
for type reads during requested resets and native click sequences. The original
whole-form scan grows about 16×; native named candidates grow 4× for fixed-size
groups. These are framework work counters, not wall times or a complexity
guarantee for the browser's native collection implementation. Ordinary and
ViewTransition updates are unchanged controls under the commit-only runtime;
no staging mechanism is involved. The single-large-group control intentionally
retains group-size scans.
