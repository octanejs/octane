---
"octane": patch
---

Release unused keyless signal cells and computations when the last reader leaves. Idle computations keep their cached values and check for changed inputs on the next read.
