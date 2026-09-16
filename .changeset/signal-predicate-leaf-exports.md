---
'octane': patch
---

Export signal-handle predicates directly from their lightweight protocol module so a capability check alone does not retain signal-owner initialization or the signal engine. Predicate behavior and identity are unchanged.
