---
'octane': patch
---

Keep unsettled writes available for receipt lookup after a temporary journal read failure or an incompatible build. Resume feeds from the last successfully saved update and preserve invalidations across restarts when a save and a later invalidation share a timestamp.
