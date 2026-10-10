---
'@octanejs/puck': patch
'@octanejs/mcp-server': patch
---

Use the official TanStack adapters for Pacer and Hotkeys.

- `@octanejs/puck` now depends on `@tanstack/octane-pacer` in place of `@octanejs/tanstack-pacer`.
- The MCP bridge maps `@tanstack/react-pacer` and `@tanstack/react-hotkeys` to `@tanstack/octane-pacer` and `@tanstack/octane-hotkeys`.
