---
'octane': patch
---

Observe promises recreated by plain async components during server replay, so rejected components render their `@catch` arm without emitting duplicate unhandled rejections.
