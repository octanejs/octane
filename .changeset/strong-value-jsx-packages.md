---
'@octanejs/devtools': patch
'@octanejs/tanstack-router': patch
---

The devtools panel tabs render as template bodies, and the compiled Router document leaves its server-only `<html>`, `<head>`, and `<body>` out of client builds, so neither builds element descriptors in a Strong application.
