---
'octane': patch
'@octanejs/mcp-server': patch
---

Keep universal state updates proportional to their retained owner subtree: a leaf `setState` replays only its owning component, keyed-list item state and several owners updated by one event replay their nearest shared component ancestor instead of the root, updates under an idle `@try`/Suspense boundary stay scoped (active episodes and retained-hidden content still replay from the root, and a scoped render error falls back so the boundary catches it), structural updates that insert, reorder, or remove hosts commit through the scope's physical frame, compact leaf rows driven by list state update within their owning list component, and scoped commits edit the accepted listener tables in place instead of cloning them. Also avoid cloning the object driver's full instance map when preparing a small host batch, and expose the corresponding benchmark through the MCP server.
