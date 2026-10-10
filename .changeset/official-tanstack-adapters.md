---
'@octanejs/puck': patch
'@octanejs/mcp-server': patch
---

Use the official TanStack adapters for Pacer, Hotkeys, and Table.

- `@octanejs/puck` now depends on `@tanstack/octane-pacer` in place of `@octanejs/tanstack-pacer`.
- The MCP bridge maps `@tanstack/react-pacer`, `@tanstack/react-hotkeys`, and `@tanstack/react-table` to `@tanstack/octane-pacer`, `@tanstack/octane-hotkeys`, and `@tanstack/octane-table`.
