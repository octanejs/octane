---
'octane': patch
---

Warn when an explicit `key` attribute on an intrinsic DOM root of a `@for` arm uses legacy row-key syntax. The diagnostic points to the `; key expr` header clause so authors can avoid the native template fallback without changing existing compilation behavior. Component root keys remain valid and do not produce this warning.
