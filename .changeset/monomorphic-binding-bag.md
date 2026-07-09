---
'octane': patch
---

Compiler: allocate each body's binding bag as a single full-shape object literal instead of growing `{}` one property at a time during mount. Every bag instance now gets its final V8 hidden class at allocation, so mount fills and update diffs are monomorphic in-place stores — no per-field map transitions on the mount path (row bodies included).
