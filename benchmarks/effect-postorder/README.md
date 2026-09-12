# Effect postorder comparator

Run from the repository root with Node 24 or newer:

```bash
node benchmarks/effect-postorder/run.mjs upstream/main
```

The script extracts the **actual** `comparePostOrder` implementation from the
specified Git revision and the working `packages/octane/src/runtime.ts`, strips
its TypeScript annotations, and runs identical sorts. It checks both versions
against tree postorder and compares sampled pairs before timing. The four
shapes are a 400-component chain, 1,000 sibling owners, uneven sibling
branches, and 128 deep disjoint leaves whose parents sit 25 levels below a
shared root. A counted pass records parent-chain reads independently of the timed
pass. Eight interleaved, warmed batches report median microseconds per sort.

This isolates sorting cost; it does not measure render, DOM, or effect callback
time. Use `benchmarks/effectful-list` for the full 1,000-row lifecycle path,
and the conformance effect-order tests for observable effect/ref ordering.

The separate untimed ref-drain guard exercises the production `drainRefAttaches`
and comparator with 1,000 sibling refs, deep disjoint branches, a mixed-depth
parent/child commit, a single ref, and ownerless refs before, after, and without
owned refs. It checks callback order and counts native sort calls, with no DOM
or callback timing claim:

```bash
node benchmarks/effect-postorder/refs.mjs <baseline-git-ref> --measure
node benchmarks/effect-postorder/refs.mjs <baseline-git-ref>
```

The `effect-scheduling` ratio suite runs this guard alongside the scheduler
wave guard. Single-ref, 1,000-sibling, and ownerless-only batches must call
native sort zero times; mixed-ancestry, deep-disjoint, and mixed-owner batches
retain one sort and the same postorder callbacks. At base `8a45222ab`, all
seven cases each sorted once. The candidate skips three sorts and retains the
other four. Null owners compare equal to unrelated entries, so an ownerless
entry can join a same-parent queue without changing callback order. The
deep-disjoint comparator shape reads 11,340 parent links for 129 queued
effects on both versions: sorting those branches still needs the ancestry
check, and this change adds no persistent block depth field.
