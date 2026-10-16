---
"@octanejs/tanstack-router": patch
---

Initialize link hooks before creating Link and separate link API module names so
browser bundlers resolve native and custom links correctly on case-insensitive
filesystems.
