---
'@octanejs/mcp-server': patch
---

Add a `./bridge` subpath export and `bridgeReportFromSource(source, { packageName })`, a filesystem-free variant of `bridgeReport` for hosted consumers that scan pasted source instead of an installed package.
