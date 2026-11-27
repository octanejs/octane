---
'octane': patch
---

`octane/data` saves a changed value to the persistent cache even when its unobserved read is evicted before the next host task, as on a busy page, instead of deleting the saved copy.
