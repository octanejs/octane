---
'octane': patch
---

Reuse buffered streamed-result frame sizes when partially draining the browser mailbox, avoiding repeated serialization and UTF-8 encoding while preserving its byte limit.
