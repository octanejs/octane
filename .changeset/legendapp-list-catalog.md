---
'@octanejs/cli': patch
'@octanejs/mcp-server': patch
---

Map `@legendapp/list/react` to `@octanejs/legendapp-list` in the binding catalog, so `@octanejs/codemod` rewrites its imports to the binding instead of reporting the package as unported.
