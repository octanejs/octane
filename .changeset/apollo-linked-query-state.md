---
'@octanejs/apollo-client': patch
---

Update Apollo query state immediately when its client or query changes without
calling a state setter during render. Preserve the previous query result,
observable lifecycle, and compatibility with Octane Strong mode.
