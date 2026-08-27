---
'octane': patch
'@octanejs/mcp-server': patch
---

Cache configured root membership and the sorted language-service root list in TypeScript-backed text inference so repeated warm snapshots no longer scale with unrelated project roots, and expose the regression benchmark through the MCP benchmark runner.
