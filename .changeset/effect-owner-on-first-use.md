---
'octane': patch
---

Make components cheaper to mount and unmount in an application that uses signals: an effect or cleanup creates its component's signal owner only when it asks for one, so a component that is deleted without having used a signal no longer builds an owner during its cleanups.
