---
'octane': patch
---

Preserve scoped CSS selectors in split Hydrate children when production builds compile mutable parser ASTs. Deferred and independent activation now inject the same scoped stylesheet that matches the server DOM.
