---
'@octanejs/cli': patch
'@octanejs/mcp-server': patch
---

Map `@pierre/diffs/react` to `@octanejs/pierre-diffs` in the binding catalog, so `@octanejs/codemod` rewrites `@pierre/diffs/react` imports to the binding and leaves the other `@pierre/diffs` entries as they are.
