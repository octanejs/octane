# DOM expando misses

This production Node/jsdom probe measures the property reads behind the
unseeded DOM expando finding in [octanejs/octane#981](https://github.com/octanejs/octane/issues/981).
It runs each built client runtime in its own process with a fresh DOM. The
fixture mounts 128 keyed descriptor components, activates raw HTML once, then
measures missing expando reads on ordinary host elements, text nodes, and inputs.
The `defaultChecked` marker is excluded: the runtime only tests whether that
symbol is present, and seeding it would require an own-property test on every
initial `defaultChecked` write.
It also times a complete descriptor update, an unseeded symbol miss, and a
present `nodeType` lookup as controls. Five untimed rounds precede the samples;
target order alternates.

Build Octane on each revision and freeze both `packages/octane/dist` directories.
The frozen directories must retain their relative imports and an enclosing
`package.json` with `"type": "module"`. Supply both to compare them, or one
for a standalone run:

```bash
BENCH_BASELINE_DIST_DIR=/absolute/baseline/packages/octane/dist \
BENCH_CANDIDATE_DIST_DIR=/absolute/candidate/packages/octane/dist \
BENCH_JSON=/tmp/dom-expando.json node benchmarks/dom-expando/run.mjs 13

BENCH_DIST_DIR=/absolute/frozen/packages/octane/dist \
node benchmarks/dom-expando/run.mjs 13
```

When this worktree has no local dependencies, set `BENCH_DEPENDENCIES_DIR` to a
same-lockfile Octane checkout that has `jsdom` installed. Compare B–C–C–B
process order as well as the paired run above before interpreting small timing
differences. The runner requires the same semantic hash for every target on
both versions, validates retained keyed DOM nodes and updated text, and checks
live `defaultValue` and first `defaultChecked` behavior. Its untimed diagnostics
show whether each formerly missing key was seeded on the right DOM prototype;
they do not assert internal layout as a correctness contract.

These numbers isolate JavaScript property lookups in jsdom. They cannot measure
Blink DOM lookup speed, layout, paint, browser memory, or an application-wide
improvement. The complete descriptor update includes much more work and can
remain inside measurement noise even when the lookup mechanism changes.
