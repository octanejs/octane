---
'octane': patch
'@octanejs/mcp-server': patch
---

Drain queued behavior-root interactions with amortized cursor compaction and
constant-time pending-adoption bookkeeping so late modules and separately
settling async adoptions stay linear while preserving FIFO and reentrant delivery.
Expose the accompanying browser benchmark through the Octane MCP benchmark tool.
