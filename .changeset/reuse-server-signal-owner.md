---
'octane': patch
---

Reuse the resolved server signal owner when invoking a component, avoiding a duplicate instance lookup while preserving nested request ownership.
