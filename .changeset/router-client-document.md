---
'@octanejs/tanstack-router': patch
---

The compiled `Html`, `Head`, and `Body` leave their server-only `<html>`, `<head>`, and `<body>` elements out of client builds.
