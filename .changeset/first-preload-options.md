---
'octane': patch
---

Preserve the first script or stylesheet preload's options when equivalent calls are deduplicated, so a later preinit inherits the original integrity and connection metadata. Explicit preinit options continue to take precedence.
