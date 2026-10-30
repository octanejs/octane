---
'@octanejs/cli': patch
'@octanejs/mcp-server': patch
---

Map `@pierre/trees/react` to `@octanejs/pierre-trees` in the binding catalog, so `@octanejs/codemod` rewrites `@pierre/trees/react` imports to the binding and leaves `@pierre/trees` imports in place.
