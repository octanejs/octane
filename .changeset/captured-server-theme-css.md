---
'octane': patch
---

Include imported theme styles in server output when `$class` or a class-map entry was captured at module scope or cached during an earlier render. Collect the theme and its dependencies when the class is rendered, preserving request-specific styles, dependency order, and CSP nonces.
