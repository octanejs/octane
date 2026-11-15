---
'@octanejs/codemod': patch
---

Preserve a selected JavaScript file when an executable relative import names that file but TypeScript resolves the request to a different source. The rename conflict keeps the original runtime path and its separate types together.
