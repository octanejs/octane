---
'octane': patch
---

Preserve accepted scalar DOM-binding updates when hydrating older server-rendered state.

Compile scalar text leaves and mixed structural/scalar projections independently,
retain the current bound text, attributes, classes, and style properties during
hydration, and release their ownership when the binding is disposed or aborted.
Unrelated DOM mutations still receive normal hydration diagnostics and repair.
