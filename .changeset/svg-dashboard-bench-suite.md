---
'@octanejs/mcp-server': patch
---

Expose the new `svg-dashboard` benchmark suite through the MCP server: a
hand-rolled-SVG observability dashboard rendered byte-identically by octane,
react, solid, and svelte fixtures, stressing path-`d`/transform churn, keyed
reconciliation inside `<svg>`, foreignObject namespace push/pop, portal
tooltips into an SVG overlay, and the `createElement` icon de-opt path.
