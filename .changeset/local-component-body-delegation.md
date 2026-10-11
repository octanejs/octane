---
'octane': patch
---

Reduce production rendering overhead for proven same-module components. Fuse string-only private children into retained entry templates and collapse safe forwarding chains to their terminal component, preserving generated start/end comments and existing hook, suspension, and hydration behavior.
