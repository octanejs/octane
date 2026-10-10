---
'octane': patch
---

Allow applications without portals to omit portal event-ownership preparation and teardown code. Portal registration activates these helpers before rendering or deferred publication, preserving late children, rollback, and events crossing portal removal.
