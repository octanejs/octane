---
'octane': patch
'@octanejs/mcp-server': patch
---

Skip manifest-cache scans for ordinary watched source changes while preserving package-manifest, full-reset, and diagnostic invalidation behavior. Expose the accompanying manifest-cache invalidation benchmark through the Octane MCP benchmark tool.
