---
'octane': patch
'@octanejs/mcp-server': patch
---

Avoid temporary boundary-collection copies during streaming SSR completion,
error and abort scans, and reuse immutable CSS/head snapshots for completed
boundaries. Extend the benchmark catalog with the final SSR and client coverage
investigations from the runtime performance audit.
