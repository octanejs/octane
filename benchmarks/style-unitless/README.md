# Style unitless-property benchmark

This Node-only suite measures numeric `cssStyleValue` writes through the
production `isUnitlessStyleProp` helper and the prior
`replaceAll` + `toLowerCase` scan. Each sample serializes a mixed bag of
unitless, px, kebab, vendor-prefixed, and custom-property keys.

The mixed case is the animation-frequency path: the same authored keys repeat.
A never-repeated key stream is not the target — that path still pays the
original normalize plus a Map miss, and is not claimed as a win. Correctness
gates require identical CSS strings and the same unitless classification
before timings are accepted.

Run it through the unified harness:

```bash
node benchmarks/bench.mjs --quick --ratios style-unitless
```
