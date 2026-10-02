---
'octane': patch
---

Mount and update every component without allocating a closure context. The hydration path for a component inside a client-rebuilt subtree now calls a separate helper, so ordinary component calls no longer capture their arguments up front. Rendering behavior is unchanged.
