---
'octane': patch
'@octanejs/mcp-server': patch
---

Compile direct inline `@{ ... }` component props in Strong DOM templates as render-only bodies, without authored arrow wrappers or element descriptors. Preserve narrow dependencies for simple captured leaves, and keep setup, context, state, and cleanup owned by each receiving insertion. Ordinary JSX and blocks in other value positions retain their descriptor behavior.

Expose the `render-values` benchmark through the MCP benchmark tool.
