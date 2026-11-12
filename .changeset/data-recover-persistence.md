---
'octane': patch
---

Keep unsettled writes available for receipt lookup after a temporary journal read failure or an incompatible build. Resume feeds from the last successfully saved update and preserve invalidations across restarts when a save and a later invalidation share a timestamp.

Retry failed persistence commits once in an idle session. After 30 days, reconcile journal entries this build cannot use by checking the original receipt. An applied write with unknown effects makes cached reads stale, and an unavailable receipt keeps the entry for another start.
