---
'octane': patch
'@octanejs/mcp-server': patch
---

Specialize DOM binding child programs for explicitly fixed primitive props so unused presentation branches do not ship. Dynamic values, literal defaults, DOM adoption, and renderer hydration handoff retain their existing behavior.

Expose the fixed-prop binding benchmark in the MCP benchmark tool alongside the unified runner.
