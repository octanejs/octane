---
'octane': patch
'@octanejs/three': patch
---

Make in-place updates of a keyed list of Three meshes faster. Updating 1,000 retained mesh positions now takes about 0.7–0.8× the time React Three Fiber does on the Three benchmark, down from parity. The per-item comparison and validation work now runs in small functions the JavaScript engine optimizes as hot code. A full garbage collection no longer discards the optimized code that reads frozen host batches, so the first commit after one stays fast. Behavior is unchanged.
