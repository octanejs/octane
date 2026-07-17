---
'octane': patch
---

Discard a root's partially rendered tree when an uncaught initial render fails, preventing aborted effects from leaking into a later flush while keeping the root available for a recovery render.
