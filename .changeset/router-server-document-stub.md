---
'@octanejs/tanstack-router': patch
---

Browser builds resolve the compiled document's server-only `<html>`, `<head>`, and `<body>` components to an empty stub, so a client bundle no longer keeps the element-descriptor factory they need.
