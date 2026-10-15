---
"octane": patch
---

Commit newly created custom-element props before connecting a pure host slot. If a custom setter unmounts its root, the pending host is discarded instead of being reconnected after unmount.
