---
'octane': patch
'@octanejs/mcp-server': patch
---

Keep universal component state updates proportional to their retained owner subtree, avoid cloning the object driver's full instance map when preparing a small host batch, and expose the corresponding benchmark through the MCP server.
