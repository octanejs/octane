---
'octane': patch
'@octanejs/mcp-server': patch
---

Cache shared ancestry while ordering batched component updates so deeply nested render waves do not repeatedly walk the same parent chains.

Expose the scheduler-depth benchmark through the Octane MCP benchmark tool.
