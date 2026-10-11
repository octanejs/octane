---
'octane': patch
---

Fuse eligible static same-module component templates in production DOM and SSR builds. Private components with fixed string props can share a cloneable template while retaining their caller's component boundary. Generated JavaScript includes paired start/end comments identifying the inlined components and their source locations.
