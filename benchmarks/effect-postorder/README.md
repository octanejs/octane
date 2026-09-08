# Effect postorder comparator

Run from the repository root with Node 24 or newer:

```bash
node benchmarks/effect-postorder/run.mjs upstream/main
```

The script extracts the **actual** `comparePostOrder` implementation from the
specified Git revision and the working `packages/octane/src/runtime.ts`, strips
its TypeScript annotations, and runs identical sorts. It checks both versions
against tree postorder and compares sampled pairs before timing. The three
shapes are a 400-component chain, 1,000 sibling owners, and uneven sibling
branches. A counted pass records parent-chain reads independently of the timed
pass. Eight interleaved, warmed batches report median microseconds per sort.

This isolates sorting cost; it does not measure render, DOM, or effect callback
time. Use `benchmarks/effectful-list` for the full 1,000-row lifecycle path,
and the conformance effect-order tests for observable effect/ref ordering.
