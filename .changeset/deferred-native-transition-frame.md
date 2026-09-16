---
'octane': patch
---

Keep transition orchestration out of early signal and control module dependencies so split-chunk builds can defer it with the renderer. Native input and transition behavior are unchanged.
