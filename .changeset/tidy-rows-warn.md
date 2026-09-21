---
'octane': patch
---

Warn when an explicit `key` attribute on a DOM-owned `@for` arm root uses legacy row-key syntax. The diagnostic points to the `; key expr` header clause so authors can avoid the native template fallback without changing existing compilation behavior.
