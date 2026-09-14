---
'octane': patch
'@octanejs/mcp-server': patch
---

Keep nested scoped JSX responsive to context changes, isolate hooks and memo caches across independently compiled render bodies, and invalidate stale output when lazy bodies change. Preserve component ownership across mixed compilation modes. Expose the production body-ownership benchmark through MCP.
