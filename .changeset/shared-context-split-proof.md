---
'octane': patch
---

Preserve the production compiler's closed Context lifetime proof through generated Hydrate capture slots, so private compiled providers can keep their existing void output path across code splitting. Exported contexts, authored capture overrides, opaque provider children, and unproven bindings retain the generic rendering path.
