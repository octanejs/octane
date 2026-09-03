---
'octane': patch
'@octanejs/mcp-server': patch
---

Reduce transition bookkeeping allocations for a single pending hook and reuse staged state and reducer updates without an extra lookup.

Expose the transition bookkeeping benchmark through the MCP benchmark tool.
