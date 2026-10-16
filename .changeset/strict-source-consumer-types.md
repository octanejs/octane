---
"octane": patch
"@octanejs/tanstack-router": patch
---

Make published runtime and router source compile with exact optional properties,
index-signature property checks, and explicit overrides, without requiring Node
ambient types for browser-only router components.

Keep fragment listener snapshots on one internal object shape while preserving
undefined native option defaults at the DOM boundary.
