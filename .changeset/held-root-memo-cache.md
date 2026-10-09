---
'octane': patch
---

Fix a keyed list row that kept showing its old props after a suspended root
update resolved. The production build's output cache for the row recorded the
update's props while the update was held, and the rollback restored the screen
but not the cache, so the retry skipped the row.
