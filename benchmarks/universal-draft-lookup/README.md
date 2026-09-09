# Universal draft lookup

This Node-only benchmark uses public universal object roots with 0, 1, 128,
or 1,024 keyed child owners. Every accepted update changes each child's
`version` prop, so unchanged-owner retention cannot skip the measured work.
The scene creates a ref. Each child reads and writes that earlier owner's
`ref.current`, which places the requested owner farther from the end of the
draft list as siblings render.

The `own-ref` control reads and writes each child's own ref, whose draft is the
most recently appended owner. The `plain-property` control performs the same
sequenced reads and writes on an ordinary object without a hook. A zero-child
scene measures root-only work. `single-ancestor-read` makes only the last child
of the wide tree read the ancestor once per update; it measures the cost of
building an index for an isolated lookup. Each mode checks the version sequence,
accepted commits, host identities, ref identity and values, structural commands,
and unmount cleanup. Renderables for each sampled update are built before timing.

```bash
node benchmarks/universal-draft-lookup/run.mjs 7
```

Set `BENCH_RUNTIME_URL` to an absolute `file:` URL for a previously built
production `dist/universal.js` to compare the same frozen baseline against a
candidate without rebuilding it. `BENCH_JSON` writes benchmark-schema results
for paired comparisons. Times include component execution, reconciliation and
the object driver; controls identify shared work. The harness does not measure
browser, native-device, paint, or full-application throughput.
