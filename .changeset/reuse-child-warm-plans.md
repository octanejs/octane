---
'octane': patch
---

Reuse static children-only warm plans when registering compiled component
descendants, avoiding a fresh empty batch and warm closure on each render while
preserving the first pending descendant's fetch discovery.
