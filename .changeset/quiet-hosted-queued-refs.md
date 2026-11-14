---
"octane": patch
---

Skip queued Octane refs whose React host was deleted before they could attach. Teardown still releases refs that were already attached.
