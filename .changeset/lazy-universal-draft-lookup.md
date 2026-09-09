---
'octane': patch
'@octanejs/mcp-server': patch
---

Index universal owner drafts only when a render reads an earlier owner's hook or ref, preserving fast reads of the newest draft and the latest draft after retries.
Expose the new universal draft lookup benchmark in the MCP suite catalog.
