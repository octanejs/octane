---
"octane": patch
"@octanejs/mcp-server": patch
---

Reduce scheduler batch bookkeeping and skip ref sorting for sibling-only attachment queues, preserving update ordering, effect lifecycle checks, and render-loop limits. Expose deterministic scheduling benchmarks through the MCP benchmark catalog.
