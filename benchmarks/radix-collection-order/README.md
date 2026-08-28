# Radix collection ordering benchmark

This Node-only suite measures the internal `@octanejs/radix` helper that sorts registered
collection items into DOM order. It compares the production helper with the previous
`Array#indexOf` comparator in the same process at 16, 64, 256, and 4,096 items.

The 16- and 64-item rows prove the production helper retains the existing comparator for small
collections. The 256- and 4,096-item rows exercise the indexed path, including construction of its
node-position map. Every target sorts the same deterministic permutation, and timing is rejected
unless the final item order and checksum match. Separate controls cover empty and single-item
collections, null refs, refs outside the ordered node set, and duplicate item refs.

Run it through the unified harness:

```bash
node benchmarks/bench.mjs --quick --ratios radix-collection-order
```
