---
'octane': patch
'@octanejs/mcp-server': patch
---

Preserve accepted scoped descriptor children when Providers change host/component child shapes. Reuse known descriptor event names and reduce delegation arrays, child traversal, redundant persistent host writes, repeated form source resolution, and select option reads while preserving live DOM, event, and form-control behavior. Expose the descriptor-renderer benchmark suite through the MCP server.
