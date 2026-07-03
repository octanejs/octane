---
"octane": patch
---

Structural hydration recovery at template roots now runs in production builds.

`clone()`'s structural mismatch check (swapped `@if`/`@switch` branch, changed tag)
was gated on the dev-only source-loc argument, so prod builds silently adopted the
wrong server subtree with no rebuild — contradicting the documented contract that
only the WARNING is dev-only. Detection + rebuild now run unconditionally (synthetic
multi-root template wrappers, which have no 1:1 server node, are stamped by
`template()` and skipped); the warning stays dev-gated.
