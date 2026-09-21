---
'octane': patch
'@octanejs/mcp-server': patch
'@octanejs/vite-plugin': patch
---

Specialize DOM binding child programs for explicitly fixed primitive props so unused presentation branches do not ship. Caller propagation is opt-in through `domBindingFixedProps`; default child requests remain generic and shared. Dynamic values, literal defaults, DOM adoption, and renderer hydration handoff retain their existing behavior.

Expose the fixed-prop binding benchmark in the MCP benchmark tool alongside the unified runner.
