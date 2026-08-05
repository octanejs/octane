---
'octane': patch
'@octanejs/mcp-server': patch
---

Keep universal state updates proportional to their retained owner subtree: a leaf `setState` replays only its owning component, keyed-list item state and several owners updated by one event replay their nearest shared component ancestor instead of the root, and scoped commits edit the accepted listener tables in place instead of cloning them. Also avoid cloning the object driver's full instance map when preparing a small host batch, and expose the corresponding benchmark through the MCP server.
