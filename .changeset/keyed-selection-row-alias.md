---
'octane': patch
---

Keep keyed row selection updates bounded when a row declares a constant alias for its key before rendering. Preserve the full affected-row bodies, event captures, strict-equality behavior, and transition replay.
