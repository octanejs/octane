---
'octane': patch
---

Fix a client-only `<Hydrate>` boundary with a `never()` strategy that could reveal stale data. While its content is suspended, a parent update now re-renders that content with the new props, as on first mount. Before this, the update was held back, and once the old promise resolved the content could render it instead of waiting for the new one.
