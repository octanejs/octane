---
'octane': patch
---

Preserve canonical component wrappers across consecutive Vite hot updates so every save refreshes mounted DOM and universal-renderer components while retaining their own hook state. Keep default exports live and reload when an edit removes or invalidates a refresh boundary.
