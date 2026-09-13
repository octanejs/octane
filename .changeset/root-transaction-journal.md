---
'octane': patch
'@octanejs/mcp-server': patch
---

Restore enumerable symbol values when a root render suspends and preserve keyed
row state when an urgent update shares a batch with a suspended removal. Reduce row
input and retirement bookkeeping, and reuse the live DOM value already read
when journaling descriptor text updates. Expose the root transaction benchmark
suite through the MCP server.
