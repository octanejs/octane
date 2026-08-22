---
'octane': patch
---

Reduce generated client component code by sharing scalar-binding comparisons and renderable-child text updates through the private compiler runtime. Eligible repeated host rows retain inline comparisons to avoid extra calls and cache writes on unchanged bindings. Hydration avoids repeating attribute mutations when the server already has the final client value, and list-only reconciliation is separate from common text and function children.

Skip URL regular-expression checks only when the first character proves that the existing unsafe-protocol pattern cannot match. URL policy, controlled form values, authored evaluation order, mismatch recovery, and context propagation through unchanged child descriptors retain their existing behavior.
