---
'octane': patch
---

Preserve explicitly listed Effect Event dependencies during Strong migration. The compiler now distinguishes a non-reactive Effect Event from a value with stable identity when checking whether a dependency list can be removed.
