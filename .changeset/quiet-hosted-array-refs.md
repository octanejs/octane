---
'octane': patch
---

Stop publishing the remaining entries in an array ref when a callback deletes its React-hosted island. Preserve cleanup for each ref that already ran.
