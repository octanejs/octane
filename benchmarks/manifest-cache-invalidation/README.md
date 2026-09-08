# Manifest cache invalidation benchmark

This Node-only benchmark measures the shared compiler's watched-path invalidation cost after nearest-package decisions have been cached for many source directories.

It compares ordinary source invalidation with small and large cache populations, plus a non-matching `package.json` invalidation against the large cache. The manifest scenario is a semantic control: it must retain the full dependency scan because any cache entry may depend on that manifest path.

Run it through the unified benchmark driver:

```bash
node benchmarks/bench.mjs --quick manifest-cache-invalidation
```

The runner creates temporary package roots, populates caches before timing, alternates scenario order, checks that invalidation preserves every cached decision, and removes the fixtures afterward.
