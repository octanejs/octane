---
'@octanejs/monaco-editor': patch
---

Keep the visible editor's callbacks tied to committed props during suspended tab transitions, so edits and validation events cannot reach a pending file's handlers.
