---
"octane": patch
---

`@for` DEP-PURE deps compare with `Object.is` (NaN-safe), like hook deps.

The reconciler's deps-snapshot compare used strict `!==`, so a NaN dep permanently
defeated the pure promotion (survivor bodies re-ran on every render) and ±0 behaved
differently from the hook-side `depsChanged`. Both paths now share `Object.is`
semantics.
